import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import * as workerpool from "workerpool";
import { CUSTOM_HTTP_TRANSFORM_OUTPUT_LIMIT_BYTES } from "./custom-http-output-schema";

const CUSTOM_HTTP_TRANSFORM_TIMEOUT_MILLISECONDS = 1000;
// workerpool's default terminate timeout is longer than the transform timeout.
// Keep replacement short so a killed jq worker does not stall the next metric.
const CUSTOM_HTTP_TRANSFORM_WORKER_TERMINATE_TIMEOUT_MILLISECONDS = 100;
const CUSTOM_HTTP_TRANSFORM_WORKER_POOL_SIZE = 2;

export type CustomHttpTransformFailureReason =
    | "jqFailure"
    | "timeout"
    | "outputTooLarge"
    | "malformedOutput"
    | "workerFailure";

export type CustomHttpTransformResult =
    | {
        readonly ok: true;
        readonly output: unknown;
    }
    | {
        readonly ok: false;
        readonly reason: CustomHttpTransformFailureReason;
        readonly detail: string;
    };

/**
 * Selects how jq stdout is interpreted after a successful worker run.
 *
 * Runtime polling uses `singleJsonValue` so the worker enforces the Custom HTTP
 * metric contract immediately. The source editor uses `rawStdout` first so the
 * same jq box can also run AI-requested exploration queries and display their
 * output back to the user.
 */
export type CustomHttpTransformOutputMode = "singleJsonValue" | "rawStdout";

/**
 * Runs jq behind a timeout-capable boundary.
 *
 * Source clients depend on this interface instead of importing jq directly so a
 * timed-out transform can be killed by replacing its worker.
 */
export interface CustomHttpTransformRunner {
    runTransform(options: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
        readonly outputMode?: CustomHttpTransformOutputMode;
    }): Promise<CustomHttpTransformResult>;
    dispose(): void;
}

interface CustomHttpTransformWorkerPoolOptions {
    readonly poolSize?: number;
    readonly timeoutMilliseconds?: number;
    readonly outputLimitBytes?: number;
    readonly workerScriptUrl?: URL;
}

/**
 * Small reusable worker pool for jq transforms.
 *
 * Workers are bounded because polling can fan out across several Custom HTTP
 * widgets; spawning a fresh worker per poll would make cadence cost scale badly.
 */
export class CustomHttpTransformWorkerPool implements CustomHttpTransformRunner {
    private readonly pool: workerpool.Pool;
    private readonly timeoutMilliseconds: number;
    private readonly outputLimitBytes: number;
    private isDisposed = false;

    constructor(options: CustomHttpTransformWorkerPoolOptions = {}) {
        const poolSize = options.poolSize ?? CUSTOM_HTTP_TRANSFORM_WORKER_POOL_SIZE;
        if (!Number.isInteger(poolSize) || poolSize <= 0) {
            throw new Error("Custom HTTP transform worker pool size must be a positive integer.");
        }

        this.timeoutMilliseconds = options.timeoutMilliseconds ?? CUSTOM_HTTP_TRANSFORM_TIMEOUT_MILLISECONDS;
        this.outputLimitBytes = options.outputLimitBytes ?? CUSTOM_HTTP_TRANSFORM_OUTPUT_LIMIT_BYTES;
        this.pool = workerpool.pool(fileURLToPath(
            options.workerScriptUrl ?? resolveBundledCustomHttpTransformWorkerUrl(),
        ), {
            maxWorkers: poolSize,
            // Keep startup lazy; queue latency is acceptable for V1 and avoids
            // initializing jq-wasm workers before any Custom HTTP metric exists.
            minWorkers: 0,
            workerTerminateTimeout: CUSTOM_HTTP_TRANSFORM_WORKER_TERMINATE_TIMEOUT_MILLISECONDS,
            workerType: "thread",
        });
    }

    async runTransform(options: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
        readonly outputMode?: CustomHttpTransformOutputMode;
    }): Promise<CustomHttpTransformResult> {
        if (this.isDisposed) {
            return {
                ok: false,
                reason: "workerFailure",
                detail: "Custom HTTP transform worker pool is disposed.",
            };
        }

        const firstResult = await this.runTransformOnce(options);
        if (firstResult.ok || !isWorkerTerminatedFailure(firstResult)) {
            return firstResult;
        }

        if (this.isDisposed) {
            return {
                ok: false,
                reason: "workerFailure",
                detail: "Custom HTTP transform worker pool is disposed.",
            };
        }

        return await this.runTransformOnce(options);
    }

    dispose(): void {
        this.isDisposed = true;
        void this.pool.terminate(true, this.timeoutMilliseconds);
    }

    private async runTransformOnce(options: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
        readonly outputMode?: CustomHttpTransformOutputMode;
    }): Promise<CustomHttpTransformResult> {
        try {
            const result = await this.pool.exec("runCustomHttpTransform", [
                options.inputJson,
                options.jqTransform,
                this.outputLimitBytes,
                options.outputMode ?? "singleJsonValue",
            ]).timeout(this.timeoutMilliseconds) as unknown;
            // workerpool timeout starts when the task begins executing, not
            // when it is queued. Queue wait is bounded by the small pool size
            // and Custom HTTP V1's low expected metric count.

            return readTransformResult(result) ?? {
                ok: false,
                reason: "workerFailure",
                detail: "Worker returned an unexpected transform result.",
            };
        } catch (error) {
            if (isWorkerpoolTimeoutError(error)) {
                return {
                    ok: false,
                    reason: "timeout",
                    detail: `jq transform exceeded ${this.timeoutMilliseconds} ms.`,
                };
            }

            return {
                ok: false,
                reason: "workerFailure",
                detail: limitDetail(error instanceof Error ? error.message : String(error)),
            };
        }
    }
}

function resolveBundledCustomHttpTransformWorkerUrl(): URL {
    // Stream Deck launches the bundled plugin entry from bin/plugin.js. The
    // worker is emitted by Rollup next to that entry as bin/custom-http-transform-worker.js.
    const entryScriptPath = process.argv[1];
    if (!entryScriptPath) {
        throw new Error("Custom HTTP transform worker cannot resolve the plugin entry script path.");
    }

    return pathToFileURL(path.join(path.dirname(entryScriptPath), "custom-http-transform-worker.js"));
}

function readTransformResult(value: unknown): CustomHttpTransformResult | undefined {
    if (!isPlainObject(value)) {
        return undefined;
    }

    if (value["ok"] === true) {
        return {
            ok: true,
            output: value["output"],
        };
    }

    if (value["ok"] === false) {
        const reason = value["reason"];
        const detail = value["detail"];
        if (!isTransformFailureReason(reason) || typeof detail !== "string") {
            return undefined;
        }

        return {
            ok: false,
            reason,
            detail,
        };
    }

    return undefined;
}

function isWorkerpoolTimeoutError(error: unknown): boolean {
    return error instanceof Error && error.name === "TimeoutError";
}

function isWorkerTerminatedFailure(result: CustomHttpTransformResult): boolean {
    // Matches workerpool@10.0.2's replacement-race error after a timeout kills
    // the active worker. Keep the race test in sync before upgrading workerpool.
    return !result.ok && result.reason === "workerFailure" && result.detail === "Worker terminated";
}

function isTransformFailureReason(value: unknown): value is CustomHttpTransformFailureReason {
    return value === "jqFailure"
        || value === "timeout"
        || value === "outputTooLarge"
        || value === "malformedOutput"
        || value === "workerFailure";
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}

function limitDetail(detail: string): string {
    return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail;
}

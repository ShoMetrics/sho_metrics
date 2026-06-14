import { raw as runJqRaw } from "jq-wasm";
import * as workerpool from "workerpool";

export const CUSTOM_HTTP_TRANSFORM_WORKER_THREAD_ENTRY = "custom-http-transform-worker";

type CustomHttpTransformFailureReason =
    | "jqFailure"
    | "timeout"
    | "outputTooLarge"
    | "malformedOutput"
    | "workerFailure";

type CustomHttpTransformWorkerResult =
    | {
        readonly ok: true;
        readonly output: unknown;
    }
    | {
        readonly ok: false;
        readonly reason: CustomHttpTransformFailureReason;
        readonly detail: string;
    };

// Mirrors the pool-side mode union inside the isolated worker entry. The editor
// uses raw stdout for exploration queries; runtime polling keeps strict output.
type CustomHttpTransformOutputMode = "singleJsonValue" | "rawStdout";

async function runCustomHttpTransform(
    inputJson: unknown,
    jqTransform: string,
    outputLimitBytes: number,
    outputMode: CustomHttpTransformOutputMode = "singleJsonValue",
): Promise<CustomHttpTransformWorkerResult> {
    try {
        const result = await runJqRaw(normalizeJqInput(inputJson), jqTransform, ["-c"]);
        // Treat stderr as failure even with exitCode 0. jq debug output goes to
        // stderr, and V1 requires transform-only output for predictable support.
        if (result.exitCode !== 0 || result.stderr.trim().length > 0) {
            return {
                ok: false,
                reason: "jqFailure",
                detail: limitDetail(result.stderr || "jq transform failed."),
            };
        }

        if (Buffer.byteLength(result.stdout, "utf8") > outputLimitBytes) {
            return {
                ok: false,
                reason: "outputTooLarge",
                detail: "Transform output exceeded byte limit.",
            };
        }

        if (outputMode === "rawStdout") {
            return {
                ok: true,
                output: result.stdout,
            };
        }

        const lines = result.stdout
            .split(/\r?\n/u)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        if (lines.length !== 1) {
            return {
                ok: false,
                reason: "malformedOutput",
                detail: "jq transform must emit exactly one JSON value.",
            };
        }

        return {
            ok: true,
            output: JSON.parse(lines[0]) as unknown,
        };
    } catch (error) {
        return {
            ok: false,
            reason: "jqFailure",
            detail: limitDetail(error instanceof Error ? error.message : String(error)),
        };
    }
}

function normalizeJqInput(inputJson: unknown): string | object {
    // jq-wasm accepts object input directly, but primitive input must be passed
    // as JSON text so jq sees the original JSON value rather than a host string.
    return typeof inputJson === "object" && inputJson !== null
        ? inputJson
        : JSON.stringify(inputJson);
}

function limitDetail(detail: string): string {
    return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail;
}

if (!workerpool.isMainThread) {
    workerpool.worker({
        runCustomHttpTransform,
    });
}

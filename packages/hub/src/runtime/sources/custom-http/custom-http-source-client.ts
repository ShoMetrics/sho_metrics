import { logger } from "../../../logging/node-logger";
import { wallClockNowMilliseconds } from "../../../shared/clock";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type MetricValue,
} from "../metric-source";
import {
    type MetricUnavailableReport,
    type SourceMetricValueMetadata,
    type SourceClient,
    type SourceClientStatus,
    type SourceSnapshotReadResult,
} from "../source-client";
import { CUSTOM_HTTP_SOURCE_ID } from "../source-ids";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";
import {
    customHttpDefinitionRegistry,
    type CustomHttpDefinitionRegistry,
    type CustomHttpMetricDefinition,
} from "./custom-http-definition-registry";
import {
    PluginGlobalCustomHttpCredentialSettingsReader,
    prepareCustomHttpRequest,
    redactCustomHttpPreparedAuthSecrets,
    resolveCustomHttpPreparedAuth,
    type CustomHttpCredentialSettingsReader,
} from "./custom-http-auth";
import { CUSTOM_HTTP_METRIC_KEY_PREFIX } from "./custom-http-metric-key";
import { NodeCustomHttpFetcher, type CustomHttpFetcher } from "./custom-http-fetcher";
import {
    validateCustomHttpMetricTransformOutput,
    type CustomHttpMetricTransformOutput,
} from "./custom-http-output-schema";
import {
    CustomHttpTransformWorkerPool,
    type CustomHttpTransformRunner,
} from "./custom-http-transform-worker-pool";

const log = logger.for("Source:CustomHTTP");
const FAILURE_LOG_INTERVAL_MILLISECONDS = 30000;

interface CustomHttpSourceClientOptions {
    readonly definitionRegistry?: CustomHttpDefinitionRegistry;
    readonly fetcher?: CustomHttpFetcher;
    readonly credentialSettingsReader?: CustomHttpCredentialSettingsReader;
    readonly transformRunner?: CustomHttpTransformRunner;
    readonly wallClockNow?: () => number;
}

interface CustomHttpMetricReadSuccess {
    readonly metricKey: string;
    readonly output: CustomHttpMetricTransformOutput;
}

interface CustomHttpMetricReadFailure {
    readonly metricKey: string;
    readonly stage: string;
    readonly detail: string;
}

type CustomHttpMetricReadResult = CustomHttpMetricReadSuccess | CustomHttpMetricReadFailure;

/**
 * Runtime source client for widget-local Custom HTTP metrics.
 *
 * The client owns fetch/parse/jq/schema work and returns metric snapshots only;
 * it deliberately does not build widget render data or persist source settings.
 */
export class CustomHttpSourceClient implements SourceClient {
    readonly sourceId = CUSTOM_HTTP_SOURCE_ID;

    private readonly definitionRegistry: CustomHttpDefinitionRegistry;
    private readonly fetcher: CustomHttpFetcher;
    private readonly credentialSettingsReader: CustomHttpCredentialSettingsReader;
    private readonly transformRunner: CustomHttpTransformRunner;
    private readonly wallClockNow: () => number;
    private status: SourceClientStatus = { state: "unknown" };

    constructor(options: CustomHttpSourceClientOptions = {}) {
        this.definitionRegistry = options.definitionRegistry ?? customHttpDefinitionRegistry;
        this.fetcher = options.fetcher ?? new NodeCustomHttpFetcher();
        this.credentialSettingsReader = options.credentialSettingsReader ?? new PluginGlobalCustomHttpCredentialSettingsReader();
        this.transformRunner = options.transformRunner ?? new CustomHttpTransformWorkerPool();
        this.wallClockNow = options.wallClockNow ?? wallClockNowMilliseconds;
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [
            metricKey,
            metricKey.startsWith(CUSTOM_HTTP_METRIC_KEY_PREFIX)
                ? { state: "owned", pollingGroupId: metricKey }
                : { state: "unsupported" },
        ]));
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        const snapshotTimestampMilliseconds = this.wallClockNow();
        const metricResults = await Promise.all(metricKeys.map(metricKey => this.readMetric(metricKey)));
        const metrics: Record<string, MetricValue> = {};
        const valueMetadata: SourceMetricValueMetadata[] = [];
        const unavailableMetrics: MetricUnavailableReport[] = [];
        let successCount = 0;

        for (const metricResult of metricResults) {
            if (isMetricReadSuccess(metricResult)) {
                successCount += 1;
                metrics[metricResult.metricKey] = buildScalarMetricValue(metricResult.output.value, {
                    unit: metricResult.output.unit,
                });
                valueMetadata.push(buildValueMetadata(metricResult.metricKey, metricResult.output));
                continue;
            }

            unavailableMetrics.push({
                metricId: metricResult.metricKey,
                reason: metricResult.stage === "schema" || metricResult.stage === "jq"
                    ? "invalidValue"
                    : "unknown",
            });
            this.logMetricFailure(metricResult);
        }

        this.status = successCount > 0 || metricKeys.length === 0
            ? {
                state: "available",
                lastSuccessAtTimestampMilliseconds: snapshotTimestampMilliseconds,
            }
            : {
                state: "unavailable",
                reason: "sourceError",
                lastFailureAtTimestampMilliseconds: snapshotTimestampMilliseconds,
            };

        return {
            snapshot: buildMetricSnapshot({
                timestampMilliseconds: snapshotTimestampMilliseconds,
                metrics,
            }),
            valueMetadata,
            unavailableMetrics,
        };
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    dispose(): void {
        this.transformRunner.dispose();
    }

    private async readMetric(metricKey: string): Promise<CustomHttpMetricReadResult> {
        try {
            const definition = this.definitionRegistry.read(metricKey);
            if (!definition) {
                return {
                    metricKey,
                    stage: "definition",
                    detail: "Missing runtime definition.",
                };
            }

            return await this.readDefinition(definition);
        } catch (error) {
            return {
                metricKey,
                stage: "internal",
                detail: limitDetail(error instanceof Error ? error.message : String(error)),
            };
        }
    }

    private async readDefinition(definition: CustomHttpMetricDefinition): Promise<CustomHttpMetricReadResult> {
        const authResult = resolveCustomHttpPreparedAuth({
            url: definition.request.url,
            authReference: definition.request.auth,
            credentialSettings: this.credentialSettingsReader.readCredentialSettings(),
        });
        if (!authResult.ok) {
            return {
                metricKey: definition.identity.metricKey,
                stage: "auth",
                detail: authResult.detail,
            };
        }

        const preparedRequestResult = prepareCustomHttpRequest({
            url: definition.request.url,
            auth: authResult.auth,
        });
        if (!preparedRequestResult.ok) {
            return {
                metricKey: definition.identity.metricKey,
                stage: "auth",
                detail: preparedRequestResult.detail,
            };
        }

        const fetchOptions = preparedRequestResult.headers === undefined
            ? definition.request.requestSettings
            : {
                ...definition.request.requestSettings,
                headers: preparedRequestResult.headers,
            };
        const fetchResult = await this.fetcher.fetchJson(preparedRequestResult.url, fetchOptions);
        if (!fetchResult.ok) {
            return {
                metricKey: definition.identity.metricKey,
                stage: fetchResult.reason,
                detail: redactCustomHttpPreparedAuthSecrets(fetchResult.detail, authResult.auth),
            };
        }

        let inputJson: unknown;
        try {
            inputJson = JSON.parse(fetchResult.responseText);
        } catch {
            return {
                metricKey: definition.identity.metricKey,
                stage: "json",
                detail: "HTTP response was not valid JSON.",
            };
        }

        const transformResult = await this.transformRunner.runTransform({
            inputJson,
            jqTransform: definition.request.jqTransform,
        });
        if (!transformResult.ok) {
            return {
                metricKey: definition.identity.metricKey,
                stage: transformResult.reason === "jqFailure" ? "jq" : transformResult.reason,
                detail: transformResult.detail,
            };
        }

        const validationResult = validateCustomHttpMetricTransformOutput(transformResult.output);
        if (!validationResult.ok) {
            return {
                metricKey: definition.identity.metricKey,
                stage: "schema",
                detail: validationResult.reason,
            };
        }

        return {
            metricKey: definition.identity.metricKey,
            output: validationResult.output,
        };
    }

    private logMetricFailure(failure: CustomHttpMetricReadFailure): void {
        log.atWarn()
            .everyMs(
                `custom-http-metric-failure:${failure.metricKey}:${failure.stage}`,
                FAILURE_LOG_INTERVAL_MILLISECONDS,
            )
            .log(() => [
                "Custom HTTP metric read failed",
                `metricKey=${failure.metricKey}`,
                `stage=${failure.stage}`,
                `detail=${redactUrlLikeFailureDetail(failure.detail)}`,
            ].join(" "));
    }
}

function buildValueMetadata(
    metricKey: string,
    output: CustomHttpMetricTransformOutput,
): SourceMetricValueMetadata {
    return {
        metricId: metricKey,
        valueFreshness: "fresh",
        displayHint: {
            label: output.label,
            unit: output.unit,
            ...(output.customUnit === undefined ? {} : { customUnit: output.customUnit }),
            ...(output.maximum === undefined ? {} : { maximum: output.maximum }),
            ...(output.suggestedLucideIconId === undefined ? {} : {
                suggestedLucideIconId: output.suggestedLucideIconId,
            }),
        },
    };
}

function isMetricReadSuccess(metricResult: CustomHttpMetricReadResult): metricResult is CustomHttpMetricReadSuccess {
    return "output" in metricResult;
}

function limitDetail(detail: string): string {
    return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail;
}

function redactUrlLikeFailureDetail(detail: string): string {
    return limitDetail(detail.replaceAll(/https?:\/\/\S+/gi, "[url-redacted]"));
}

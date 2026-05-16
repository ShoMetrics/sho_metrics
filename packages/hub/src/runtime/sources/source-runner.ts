import { logger } from "../../logging/logger";
import {
    buildMetricSnapshot,
    type IMetricSnapshot,
    type IMetricValue,
} from "./source.interface";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type SourceCandidate,
} from "./metric-read-plan";
import type { SourceRegistry } from "./source-registry";

const log = logger.for("SourceRunner");
const FALLBACK_LOG_INTERVAL_MILLISECONDS = 30000;

/** Polls runtime source candidates for one normalized metric read plan. */
export interface SourceRunner {
    /** Reads one source-scoped snapshot, applying source candidate fallback. */
    poll(readPlan: MetricReadPlan): Promise<IMetricSnapshot>;

    /** Releases runner-owned source resources. */
    dispose(): void;
}

/** Default SourceRunner implementation used by the local plugin runtime. */
export class DefaultSourceRunner implements SourceRunner {
    constructor(private readonly sourceRegistry: SourceRegistry) {}

    async poll(readPlan: MetricReadPlan): Promise<IMetricSnapshot> {
        const normalizedReadPlan = normalizeMetricReadPlan(readPlan);
        const pollStartTimestampMilliseconds = Date.now();

        if (normalizedReadPlan.metricKeys.length === 0) {
            return this.pollFirstAvailableSnapshot(normalizedReadPlan, pollStartTimestampMilliseconds);
        }

        const pendingMetricKeys = new Set(normalizedReadPlan.metricKeys);
        const metrics: Record<string, IMetricValue> = {};
        const sourceCandidates = resolveSourceCandidates(normalizedReadPlan);

        for (const sourceCandidate of sourceCandidates) {
            if (pendingMetricKeys.size === 0) {
                break;
            }

            const sourceClient = this.sourceRegistry.resolveSourceClient(sourceCandidate.sourceId);
            if (!sourceClient) {
                this.logFallback("missing-source", sourceCandidate.sourceId, normalizedReadPlan);
                continue;
            }

            const requestedMetricKeys = Array.from(pendingMetricKeys);
            try {
                const snapshot = await sourceClient.readSnapshot(requestedMetricKeys);
                const resolvedMetricKeys = copyValidMetricValues(snapshot, requestedMetricKeys, metrics);

                for (const metricKey of resolvedMetricKeys) {
                    pendingMetricKeys.delete(metricKey);
                }

            } catch (error) {
                this.logFallback("source-error", sourceCandidate.sourceId, normalizedReadPlan, error);
            }
        }

        return buildMetricSnapshot({
            sourceId: normalizedReadPlan.sourceScopeId,
            timestampMilliseconds: pollStartTimestampMilliseconds,
            metrics,
        });
    }

    dispose(): void {
        this.sourceRegistry.dispose();
    }

    private async pollFirstAvailableSnapshot(
        readPlan: MetricReadPlan,
        fallbackTimestampMilliseconds: number,
    ): Promise<IMetricSnapshot> {
        for (const sourceCandidate of resolveSourceCandidates(readPlan)) {
            const sourceClient = this.sourceRegistry.resolveSourceClient(sourceCandidate.sourceId);
            if (!sourceClient) {
                this.logFallback("missing-source", sourceCandidate.sourceId, readPlan);
                continue;
            }

            try {
                const snapshot = await sourceClient.readSnapshot([]);

                return buildMetricSnapshot({
                    sourceId: readPlan.sourceScopeId,
                    timestampMilliseconds: fallbackTimestampMilliseconds,
                    metrics: snapshot.metrics,
                });
            } catch (error) {
                this.logFallback("source-error", sourceCandidate.sourceId, readPlan, error);
            }
        }

        return buildMetricSnapshot({
            sourceId: readPlan.sourceScopeId,
            timestampMilliseconds: fallbackTimestampMilliseconds,
            metrics: {},
        });
    }

    private logFallback(
        reason: string,
        sourceId: string,
        readPlan: MetricReadPlan,
        error?: unknown,
    ): void {
        log.atWarn()
            .everyMs(`${reason}:${sourceId}`, FALLBACK_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "sourceFallback",
                `reason=${reason}`,
                `sourceId=${sourceId}`,
                `sourceScopeId=${readPlan.sourceScopeId}`,
                `metricCount=${readPlan.metricKeys.length}`,
                `error=${error == null ? "" : String(error)}`,
            ].join(" "));
    }
}

function resolveSourceCandidates(readPlan: MetricReadPlan): readonly SourceCandidate[] {
    return readPlan.failureMode === "fallback"
        ? readPlan.sourceCandidates
        : readPlan.sourceCandidates.slice(0, 1);
}

function copyValidMetricValues(
    snapshot: IMetricSnapshot,
    metricKeys: readonly string[],
    targetMetrics: Record<string, IMetricValue>,
): readonly string[] {
    const resolvedMetricKeys: string[] = [];

    for (const metricKey of metricKeys) {
        const metricValue = snapshot.metrics[metricKey];
        if (!metricValue || !isMetricValueValid(metricValue)) {
            continue;
        }

        targetMetrics[metricKey] = metricValue;
        resolvedMetricKeys.push(metricKey);
    }

    return resolvedMetricKeys;
}

function isMetricValueValid(metricValue: IMetricValue): boolean {
    switch (metricValue.data.case) {
        case "scalar":
            return Number.isFinite(metricValue.data.value);
        case "text":
            return metricValue.data.value.trim().length > 0;
        default:
            return false;
    }
}

/** Source scope used for telemetry collected from the current machine. */
export const LOCAL_SOURCE_SCOPE_ID = "local";

/** Source id for the built-in Node/systeminformation fallback source. */
export const NODE_SYSTEM_SOURCE_ID = "node-system";

/** How a read plan handles missing values after source candidates are tried. */
export type MetricReadPlanFailureMode = "fallback" | "empty";

/** One source candidate in priority order for a metric read plan. */
export interface SourceCandidate {
    /** Source id owned by the runtime source registry. */
    readonly sourceId: string;
}

/** Runtime-only description of which metrics to read and which sources may serve them. */
export interface MetricReadPlan {
    /** Logical storage scope for samples read by this plan. */
    readonly sourceScopeId: string;

    /** ShoMetrics canonical metric keys requested by subscribers. */
    readonly metricKeys: readonly string[];

    /** Candidate source ids in priority order. */
    readonly sourceCandidates: readonly SourceCandidate[];

    /** Missing-value behavior after candidate sources are exhausted. */
    readonly failureMode: MetricReadPlanFailureMode;
}

/** Source-scoped identity for one metric inside MetricStore. */
export interface MetricStoreKey {
    /** Logical source scope that owns this metric history. */
    readonly sourceScopeId: string;

    /** ShoMetrics canonical metric key inside the source scope. */
    readonly metricKey: string;
}

/** Builds the default local read plan backed by the built-in Node source. */
export function buildLocalMetricReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return normalizeMetricReadPlan({
        sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
        metricKeys,
        sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
        failureMode: "fallback",
    });
}

/** Normalizes a read plan into the stable form used by schedulers and tests. */
export function normalizeMetricReadPlan(readPlan: MetricReadPlan): MetricReadPlan {
    return {
        sourceScopeId: readPlan.sourceScopeId,
        metricKeys: normalizeMetricKeys(readPlan.metricKeys),
        sourceCandidates: normalizeSourceCandidates(readPlan.sourceCandidates),
        failureMode: readPlan.failureMode,
    };
}

/** Builds a stable grouping key for equivalent normalized read plans. */
export function buildMetricReadPlanKey(readPlan: MetricReadPlan): string {
    const normalizedReadPlan = normalizeMetricReadPlan(readPlan);

    return JSON.stringify([
        normalizedReadPlan.sourceScopeId,
        normalizedReadPlan.failureMode,
        normalizedReadPlan.sourceCandidates.map(candidate => candidate.sourceId),
        normalizedReadPlan.metricKeys,
    ]);
}

function normalizeMetricKeys(metricKeys: readonly string[]): readonly string[] {
    return Array.from(new Set(metricKeys)).sort();
}

function normalizeSourceCandidates(sourceCandidates: readonly SourceCandidate[]): readonly SourceCandidate[] {
    const seenSourceIds = new Set<string>();
    const normalizedSourceCandidates: SourceCandidate[] = [];

    for (const sourceCandidate of sourceCandidates) {
        if (seenSourceIds.has(sourceCandidate.sourceId)) {
            continue;
        }

        seenSourceIds.add(sourceCandidate.sourceId);
        normalizedSourceCandidates.push(sourceCandidate);
    }

    return normalizedSourceCandidates;
}

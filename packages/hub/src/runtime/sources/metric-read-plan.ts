import {
    LOCAL_SOURCE_SCOPE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "./source-ids";

export { LOCAL_SOURCE_SCOPE_ID } from "./source-ids";

/** How a read plan handles missing values after source candidates are tried. */
export type MetricReadPlanFailureMode = "fallback" | "empty";

/** Options for building the default local read plan. */
export interface LocalMetricReadPlanOptions {
    /** Platform used to choose local helper candidates. */
    readonly platform?: NodeJS.Platform;
}

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

/** Builds the default local read plan for the current machine. */
export function buildLocalMetricReadPlan(
    metricKeys: readonly string[],
    options: LocalMetricReadPlanOptions = {},
): MetricReadPlan {
    return normalizeMetricReadPlan({
        sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
        metricKeys,
        sourceCandidates: resolveLocalSourceCandidates(options.platform ?? process.platform),
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

/**
 * Selects the source candidates that may be consulted for one read plan.
 *
 * Fallback mode tries every candidate in priority order. Empty mode uses only
 * the primary candidate and renders no-data when it cannot provide a sample.
 */
export function selectMetricReadPlanSourceCandidates(
    readPlan: MetricReadPlan,
): readonly SourceCandidate[] {
    return readPlan.failureMode === "fallback"
        ? readPlan.sourceCandidates
        : readPlan.sourceCandidates.slice(0, 1);
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

function resolveLocalSourceCandidates(platform: NodeJS.Platform): readonly SourceCandidate[] {
    if (platform !== "win32") {
        return [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
    }

    return [
        { sourceId: WINDOWS_HELPER_SOURCE_ID },
        { sourceId: NODE_SYSTEM_SOURCE_ID },
    ];
}

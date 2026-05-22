import {
    LOCAL_SOURCE_SCOPE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

export { LOCAL_SOURCE_SCOPE_ID } from "../sources/source-ids";

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

/**
 * Runtime-only route for reading one metric.
 *
 * This is slightly broader than a pure source route: it also carries the
 * missing-value failure mode so collection warmup and render-time fallback use
 * the same candidate selection rules for this metric.
 */
export interface MetricReadRoute {
    /** Logical storage scope for samples read by this plan. */
    readonly sourceScopeId: string;

    /** ShoMetrics canonical metric key requested by subscribers. */
    readonly metricKey: string;

    /** Candidate source ids in priority order. */
    readonly sourceCandidates: readonly SourceCandidate[];

    /** Missing-value behavior after candidate sources are exhausted. */
    readonly failureMode: MetricReadPlanFailureMode;
}

/** Runtime-only description of which metrics to read and which sources may serve them. */
export interface MetricReadPlan {
    /** Per-metric routing entries. */
    readonly metrics: readonly MetricReadRoute[];
}

/** Builds the default local read plan for the current machine. */
export function buildLocalMetricReadPlan(
    metricKeys: readonly string[],
    options: LocalMetricReadPlanOptions = {},
): MetricReadPlan {
    const sourceScopeId = LOCAL_SOURCE_SCOPE_ID;
    const sourceCandidates = resolveLocalSourceCandidates(options.platform ?? process.platform);
    const failureMode: MetricReadPlanFailureMode = "fallback";

    return normalizeMetricReadPlan({
        metrics: metricKeys.map(metricKey => ({
            sourceScopeId,
            metricKey,
            sourceCandidates,
            failureMode,
        })),
    });
}

/** Normalizes a read plan into the stable form used by schedulers and tests. */
export function normalizeMetricReadPlan(readPlan: MetricReadPlan): MetricReadPlan {
    return {
        metrics: normalizeMetricReadRoutes(readPlan.metrics),
    };
}

/** Builds a stable grouping key for equivalent normalized read plans. */
export function buildMetricReadPlanKey(readPlan: MetricReadPlan): string {
    const normalizedReadPlan = normalizeMetricReadPlan(readPlan);

    return JSON.stringify(normalizedReadPlan.metrics.map(buildMetricIdentityTuple));
}

/**
 * Lists the metric keys referenced by a read plan.
 */
export function listMetricReadPlanKeys(readPlan: MetricReadPlan): readonly string[] {
    return normalizeMetricReadPlan(readPlan).metrics.map(metric => metric.metricKey);
}

/**
 * Selects the source candidates that may be consulted for one read-plan metric.
 *
 * Fallback mode tries every candidate in priority order. Empty mode uses only
 * the primary candidate and renders no-data when it cannot provide a sample.
 */
export function selectMetricReadRouteSourceCandidates(
    metric: MetricReadRoute,
): readonly SourceCandidate[] {
    return metric.failureMode === "fallback"
        ? metric.sourceCandidates
        : metric.sourceCandidates.slice(0, 1);
}

function normalizeMetricReadRoutes(
    metrics: readonly MetricReadRoute[],
): readonly MetricReadRoute[] {
    const metricsByKey = new Map<string, MetricReadRoute>();
    const metricIdentityKeys = new Set<string>();

    for (const metric of metrics) {
        const normalizedMetric = {
            sourceScopeId: metric.sourceScopeId,
            metricKey: metric.metricKey,
            sourceCandidates: normalizeSourceCandidates(metric.sourceCandidates),
            failureMode: metric.failureMode,
        };
        const metricIdentityKey = buildMetricIdentityKey(normalizedMetric);

        if (metricIdentityKeys.has(metricIdentityKey)) {
            continue;
        }

        const existingMetric = metricsByKey.get(normalizedMetric.metricKey);
        if (existingMetric) {
            throw new Error([
                "Metric read plan contains conflicting routes for one metric key.",
                `metricKey=${normalizedMetric.metricKey}`,
                `first=${buildMetricIdentityKey(existingMetric)}`,
                `second=${metricIdentityKey}`,
            ].join(" "));
        }

        metricsByKey.set(normalizedMetric.metricKey, normalizedMetric);
        metricIdentityKeys.add(metricIdentityKey);
    }

    return Array.from(metricsByKey.values())
        .sort((first, second) => first.metricKey.localeCompare(second.metricKey));
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

function buildMetricIdentityKey(metric: MetricReadRoute): string {
    return JSON.stringify(buildMetricIdentityTuple(metric));
}

function buildMetricIdentityTuple(metric: MetricReadRoute): readonly [
    string,
    string,
    MetricReadPlanFailureMode,
    readonly string[],
] {
    return [
        metric.metricKey,
        metric.sourceScopeId,
        metric.failureMode,
        metric.sourceCandidates.map(sourceCandidate => sourceCandidate.sourceId),
    ];
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

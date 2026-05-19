/** Source-owned polling-group result for one metric key. */
export type SourceMetricPollingGroupResolution =
    | SourceMetricPollingGroupOwnedResolution
    | SourceMetricPollingGroupUnsupportedResolution
    | SourceMetricPollingGroupUnknownResolution;

/** Metric is supported by the source and belongs to one source-scoped collector/cost group. */
export interface SourceMetricPollingGroupOwnedResolution {
    readonly state: "owned";
    readonly pollingGroupId: string;
}

/** Metric is known by the source, but this source cannot serve it. */
export interface SourceMetricPollingGroupUnsupportedResolution {
    readonly state: "unsupported";
}

/** Source has no cached ownership information for this metric. */
export interface SourceMetricPollingGroupUnknownResolution {
    readonly state: "unknown";
}

/** Synchronous source-owned resolver used by scheduler planning. */
export interface SourceMetricPollingGroupResolver {
    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution>;
}

/** Source-owned polling-group result for one metric key. */
export type SourceMetricPollingGroupResolution =
    | SourceMetricPollingGroupOwnedResolution
    | SourceMetricPollingGroupUnsupportedResolution
    | SourceMetricPollingGroupUnknownResolution
    | SourceMetricPollingGroupPendingMetadataResolution;

/**
 * Metric is supported by the source and belongs to one source-scoped collector/cost group.
 *
 * Use case: the helper has descriptor metadata for `gpu.temperature` and says
 * it can be read with the rest of the helper snapshot instead of as a separate
 * per-metric request.
 */
export interface SourceMetricPollingGroupOwnedResolution {
    readonly state: "owned";
    readonly pollingGroupId: string;
}

/**
 * Metric is known by the source, but this source cannot serve it.
 *
 * Use case: a custom HTTP profile explicitly declares weather metrics only, so
 * the planner can skip that profile for CPU or GPU metrics before any I/O.
 */
export interface SourceMetricPollingGroupUnsupportedResolution {
    readonly state: "unsupported";
}

/**
 * Source cannot classify this metric, but probing this one metric is bounded.
 *
 * Use case: a stable local source sees a new or uncategorized ShoMetrics key.
 * The planner may isolate that key so it cannot slow known CPU, RAM, disk,
 * network, or GPU groups.
 */
export interface SourceMetricPollingGroupUnknownResolution {
    readonly state: "unknown";
}

/**
 * Source needs descriptor/capability metadata before this metric can be planned safely.
 *
 * Use case: a user has LHM catalog sensor widgets while the Windows helper
 * descriptor catalog is still loading. The planner creates no helper runner, so
 * cold start cannot fan out 100 sensor ids into 100 IPC calls.
 */
export interface SourceMetricPollingGroupPendingMetadataResolution {
    readonly state: "pendingMetadata";
}

/**
 * Resolves active metric keys into source-owned planning states.
 *
 * Use case: CollectorGroupPlanner calls this synchronously during active
 * subscription planning so each source decides its own grouping, unsupported
 * metrics, and descriptor-loading state without Hub parsing source-native ids.
 */
export interface SourceMetricPollingGroupResolver {
    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution>;
}

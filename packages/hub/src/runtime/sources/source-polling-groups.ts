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

    /**
     * Optional retry offsets for this polling group after runner start or a
     * process-recovery event, relative to that trigger, applied while reads
     * fail to cover every requested metric.
     *
     * Declared by the source because the source is the authority on how its
     * group behaves: it knows its reads are the ones that miss for a while
     * after wake. The collection layer stays metric-key-agnostic and only
     * executes what is declared here.
     */
    readonly recoveryRetryOffsetsMilliseconds?: readonly number[];
}

/**
 * Standard recovery cadence for battery polling groups, relative to the
 * arming trigger (runner start or process resume), not to the previous
 * attempt.
 *
 * Battery reads are intentionally slow and separately grouped: vendor HID
 * reads share a device queue with manufacturer software (the reason for the
 * slow steady interval floor), Windows Bluetooth reads spawn PowerShell, and
 * sleeping peripherals answer slowly or not at all. A missed read therefore
 * normally waits a full slow interval, which after a wake means minutes of
 * N/A for a mouse that reconnected in seconds.
 *
 * This schedule deliberately exceeds the steady interval floor for a short,
 * bounded burst: at most five attempts inside two minutes per trigger, done
 * as soon as one read covers every requested metric. Do not "align" it back
 * to the steady floor; the whole point is that the floor is wrong for the
 * first minutes after start/resume. It is armed only by those triggers and
 * never by ordinary failures, so a permanently absent device costs a bounded
 * burst per trigger instead of living in a fast lane forever.
 */
export const BATTERY_RECOVERY_RETRY_OFFSETS_MILLISECONDS: readonly number[] = [
    10_000,
    30_000,
    60_000,
    90_000,
    120_000,
];

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

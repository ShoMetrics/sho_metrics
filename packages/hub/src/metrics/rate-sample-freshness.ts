/**
 * Resolves the render-side lifetime for a pull-sampled metric value.
 *
 * Callers own the domain grace period. This helper only applies the shared
 * polling-window formula so each metric family can keep its freshness policy
 * local.
 */
export function resolvePollingBackedSampleFreshnessBudgetMilliseconds(options: {
    readonly pollingFrequencySeconds: number;
    readonly graceMilliseconds: number;
}): number {
    if (!Number.isFinite(options.pollingFrequencySeconds) || options.pollingFrequencySeconds < 1) {
        return options.graceMilliseconds;
    }

    return (options.pollingFrequencySeconds * 1000) + options.graceMilliseconds;
}

/**
 * Checks whether a rate sample is still within its render freshness window.
 *
 * This is intentionally for rate-like samples such as network speed and disk
 * throughput, where showing an old value as live throughput is misleading.
 * The check is source-agnostic; node-system and helper-backed rate metrics both
 * arrive in MetricStore as timestamped rate samples.
 */
export function isPollingBackedRateSampleFresh(options: {
    readonly sampleTimestampMilliseconds: number | undefined;
    readonly currentTimestampMilliseconds: number;
    readonly pollingFrequencySeconds: number;
    readonly graceMilliseconds: number;
}): boolean {
    if (options.sampleTimestampMilliseconds === undefined) {
        return false;
    }

    return options.currentTimestampMilliseconds - options.sampleTimestampMilliseconds
        <= resolvePollingBackedSampleFreshnessBudgetMilliseconds(options);
}

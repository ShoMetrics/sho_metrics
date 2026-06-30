import { resolvePollingBackedSampleFreshnessBudgetMilliseconds } from "./rate-sample-freshness";

const NETWORK_SAMPLE_STALE_GRACE_MILLISECONDS = 5000;

/**
 * Resolves how long network widgets may render the last-good sample.
 *
 * Network traffic and ping share this network-owned freshness budget so single
 * and dense render paths do not drift on stale sample handling.
 */
export function resolveNetworkSampleFreshnessBudgetMilliseconds(pollingFrequencySeconds: number): number {
    return resolvePollingBackedSampleFreshnessBudgetMilliseconds({
        pollingFrequencySeconds,
        graceMilliseconds: NETWORK_SAMPLE_STALE_GRACE_MILLISECONDS,
    });
}

/** Whether a network sample is still within its render freshness window. */
export function isNetworkSampleFresh(options: {
    readonly sampleTimestampMilliseconds: number | undefined;
    readonly currentTimestampMilliseconds: number;
    readonly pollingFrequencySeconds: number;
}): boolean {
    if (options.sampleTimestampMilliseconds === undefined) {
        return false;
    }

    return options.currentTimestampMilliseconds - options.sampleTimestampMilliseconds
        <= resolveNetworkSampleFreshnessBudgetMilliseconds(options.pollingFrequencySeconds);
}

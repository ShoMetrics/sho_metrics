import {
    CUSTOM_HTTP_FETCH_DEFAULT_RETRY_COUNT,
    CUSTOM_HTTP_FETCH_DEFAULT_TIMEOUT_SECONDS,
    CUSTOM_HTTP_FETCH_MAX_RETRY_COUNT,
    CUSTOM_HTTP_FETCH_MAX_TIMEOUT_SECONDS,
    CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS,
    CUSTOM_HTTP_FETCH_RETRY_BASE_DELAY_MILLISECONDS,
    CUSTOM_HTTP_FETCH_RETRY_JITTER_RATIO,
    CUSTOM_HTTP_FETCH_RETRY_MAX_DELAY_MILLISECONDS,
} from "./custom-http-fetch-limits";

export interface ResolvedCustomHttpFetchPolicy {
    readonly timeoutSeconds: number;
    readonly retryCount: number;
}

export const CUSTOM_HTTP_TIMEOUT_SECOND_OPTIONS = [1, 2, 3, 5, 10, 15, 30] as const;
export const CUSTOM_HTTP_RETRY_COUNT_OPTIONS = [0, 1, 2, 3] as const;

/**
 * Clamps sparse or untrusted request policy input to the V1 supported range.
 */
export function resolveCustomHttpFetchPolicy(options: {
    readonly timeoutSeconds?: number | undefined;
    readonly retryCount?: number | undefined;
}): ResolvedCustomHttpFetchPolicy {
    return {
        timeoutSeconds: clampInteger(
            options.timeoutSeconds,
            CUSTOM_HTTP_FETCH_DEFAULT_TIMEOUT_SECONDS,
            1,
            CUSTOM_HTTP_FETCH_MAX_TIMEOUT_SECONDS,
        ),
        retryCount: clampInteger(
            options.retryCount,
            CUSTOM_HTTP_FETCH_DEFAULT_RETRY_COUNT,
            0,
            CUSTOM_HTTP_FETCH_MAX_RETRY_COUNT,
        ),
    };
}

/**
 * Computes the maximum time one fetch can occupy before the next poll is skipped.
 *
 * The estimate includes one final DNS diagnostic because the fetcher runs it
 * only after the last retryable network failure.
 */
export function estimateCustomHttpWorstCaseFetchMilliseconds(policy: ResolvedCustomHttpFetchPolicy): number {
    return (policy.timeoutSeconds * 1000 * (policy.retryCount + 1))
        + estimateMaximumRetryDelayMilliseconds(policy.retryCount)
        + CUSTOM_HTTP_DNS_DIAGNOSTIC_TIMEOUT_MILLISECONDS;
}

/**
 * Returns the exponential retry delay with jitter applied by the fetcher.
 *
 * Do not sum this for request-budget warnings; use
 * `estimateCustomHttpWorstCaseFetchMilliseconds` so timeout and diagnostic
 * costs stay in one source of truth.
 */
export function resolveCustomHttpRetryDelayMilliseconds(retryIndex: number, random: () => number): number {
    const baseDelayMilliseconds = Math.min(
        CUSTOM_HTTP_FETCH_RETRY_BASE_DELAY_MILLISECONDS * (2 ** retryIndex),
        CUSTOM_HTTP_FETCH_RETRY_MAX_DELAY_MILLISECONDS,
    );
    const jitterOffset = ((random() * 2) - 1) * CUSTOM_HTTP_FETCH_RETRY_JITTER_RATIO;

    return Math.max(0, Math.round(baseDelayMilliseconds * (1 + jitterOffset)));
}

function estimateMaximumRetryDelayMilliseconds(retryCount: number): number {
    let delayMilliseconds = 0;

    for (let retryIndex = 0; retryIndex < retryCount; retryIndex += 1) {
        const baseDelayMilliseconds = Math.min(
            CUSTOM_HTTP_FETCH_RETRY_BASE_DELAY_MILLISECONDS * (2 ** retryIndex),
            CUSTOM_HTTP_FETCH_RETRY_MAX_DELAY_MILLISECONDS,
        );
        delayMilliseconds += Math.round(baseDelayMilliseconds * (1 + CUSTOM_HTTP_FETCH_RETRY_JITTER_RATIO));
    }

    return delayMilliseconds;
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

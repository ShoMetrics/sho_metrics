export interface BackoffPolicyOptions {
    readonly now: () => number;
    readonly initialDelayMilliseconds: number;
    readonly maximumDelayMilliseconds: number;
    readonly factor?: number;
}

/**
 * Tracks poll-based retry cooldowns for hot collectors.
 *
 * This is intentionally not a retry wrapper. Mainstream retry libraries usually
 * own the async call and sleep before retrying; ShoMetrics needs each 1 Hz poll
 * to synchronously decide whether to attempt work or immediately return
 * cached/no-data state.
 *
 * Circuit-breaker libraries are closer, but their wrap-an-async-function shape
 * reports an open circuit through promise rejection. The runtime source hot
 * path needs an explicit `canAttempt()` check that composes with synchronous
 * cache reads before any `await`.
 */
export class BackoffPolicy {
    private consecutiveFailureCount = 0;
    private nextAttemptAllowedTimestampMilliseconds = 0;

    public static flat(now: () => number, delayMilliseconds: number): BackoffPolicy {
        return new BackoffPolicy({
            now,
            initialDelayMilliseconds: delayMilliseconds,
            maximumDelayMilliseconds: delayMilliseconds,
            factor: 1,
        });
    }

    public constructor(private readonly options: BackoffPolicyOptions) {}

    public get failureCount(): number {
        return this.consecutiveFailureCount;
    }

    public canAttempt(): boolean {
        return this.options.now() >= this.nextAttemptAllowedTimestampMilliseconds;
    }

    public remainingDelayMilliseconds(): number {
        return Math.max(0, this.nextAttemptAllowedTimestampMilliseconds - this.options.now());
    }

    public recordSuccess(): void {
        this.consecutiveFailureCount = 0;
        this.nextAttemptAllowedTimestampMilliseconds = 0;
    }

    public recordFailure(): number {
        const delayMilliseconds = this.calculateDelayMilliseconds();

        this.consecutiveFailureCount += 1;
        this.nextAttemptAllowedTimestampMilliseconds = this.options.now() + delayMilliseconds;

        return delayMilliseconds;
    }

    private calculateDelayMilliseconds(): number {
        const factor = this.options.factor ?? 2;
        const scaledDelayMilliseconds = this.options.initialDelayMilliseconds
            * Math.pow(factor, this.consecutiveFailureCount);

        if (!Number.isFinite(scaledDelayMilliseconds)) {
            return this.options.maximumDelayMilliseconds;
        }

        return Math.min(
            this.options.maximumDelayMilliseconds,
            Math.max(0, Math.round(scaledDelayMilliseconds)),
        );
    }
}

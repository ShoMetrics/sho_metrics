/**
 * Describes why runtime collection was asked to pull immediately.
 *
 * Keep this collection-owned: actions and future source notifications may
 * supply a reason, but source adapters must not branch on UI-specific causes.
 */
export type MetricCollectionRefreshReason =
    /** A user gesture asked the current widget subscriber to pull now. */
    | "manualInteraction"

    /**
     * A runtime source notification reported that a pull may now be useful.
     *
     * This is intentionally still a pull trigger, not a source-push result
     * path.
     */
    | "sourceNotification";

/**
 * Subscriber-level result returned after fan-out across live collector groups.
 *
 * These statuses are diagnostic collection outcomes, not UI states. Action UI
 * should collapse them into a much smaller visible contract such as accepted,
 * finished, or no-op.
 */
export type MetricCollectionSubscriberRefreshStatus =
    /** No live collector group currently contains the requested subscriber id. */
    | "missingSubscriber"

    /**
     * Every targeted live collector group completed a source read and ingested
     * the result.
     */
    | "refreshed"

    /**
     * No targeted collector group refreshed because at least one matching
     * runner already had an in-flight read.
     */
    | "pending"

    /**
     * No targeted collector group refreshed because at least one matching
     * runner was blocked by retry backoff.
     */
    | "backoff"

    /**
     * At least one targeted collector group refreshed and at least one targeted
     * collector group did not.
     */
    | "partial"

    /**
     * All targeted collector groups were stopped, superseded, or otherwise
     * inactive before a source read could be used.
     */
    | "skipped"

    /**
     * No targeted collector group refreshed and at least one targeted collector
     * group failed its source read.
     */
    | "failed";

/** Result of requesting an immediate collection refresh for one subscriber. */
export interface MetricCollectionSubscriberRefreshResult {
    /** Diagnostic aggregate outcome for the subscriber-scoped refresh request. */
    readonly status: MetricCollectionSubscriberRefreshStatus;
}

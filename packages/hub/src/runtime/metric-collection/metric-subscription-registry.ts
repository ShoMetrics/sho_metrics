/** Source selection mode for one metric collection subscription. */
export type MetricSubscriptionFailureMode = "fallback" | "empty";

/** Source candidate for one metric collection subscription. */
export interface MetricSubscriptionSourceCandidate {
    readonly sourceId: string;
}

/**
 * One visible action's request to keep one metric fresh.
 *
 * This is a collection subscription, not a value-event callback subscription.
 * It describes demand for background collection; rendering reads MetricStore on
 * its own render interval.
 */
export interface MetricSubscription {
    readonly subscriberId: string;
    readonly metricKey: string;
    readonly sourceScopeId: string;
    readonly sourceCandidates: readonly MetricSubscriptionSourceCandidate[];
    readonly failureMode: MetricSubscriptionFailureMode;
    readonly intervalMilliseconds: number;
}

/** Registers one subscriber's current metric collection subscriptions. */
export interface RegisterMetricSubscriptionsOptions {
    readonly subscriberId: string;
    readonly subscriptions: readonly MetricSubscription[];
}

/**
 * Tracks visible metric collection subscriptions.
 *
 * It does not poll sources, render widgets, or deliver metric callbacks. It is
 * the registration-time fact table that later collector group planning reads.
 */
export class MetricSubscriptionRegistry {
    private readonly subscriptionsBySubscriberId = new Map<string, readonly MetricSubscription[]>();
    private currentPlanningVersion = 0;

    get planningVersion(): number {
        return this.currentPlanningVersion;
    }

    /**
     * Replaces one subscriber's active collection subscriptions.
     *
     * The registry keeps this API stable for any caller, so it removes exact
     * duplicate subscriptions even though the current action path already
     * normalizes metric keys. This is input-boundary protection only; read-plan
     * normalization and collector-group planning stay outside the registry.
     */
    register(options: RegisterMetricSubscriptionsOptions): void {
        const sortedSubscriptions = options.subscriptions.slice().sort(compareMetricSubscriptions);

        this.subscriptionsBySubscriberId.set(
            options.subscriberId,
            deduplicateMetricSubscriptions(sortedSubscriptions),
        );
    }

    unregister(subscriberId: string): void {
        this.subscriptionsBySubscriberId.delete(subscriberId);
    }

    invalidatePlans(): number {
        this.currentPlanningVersion += 1;
        return this.currentPlanningVersion;
    }

    /**
     * Lists active collection subscriptions.
     */
    listSubscriptions(): readonly MetricSubscription[] {
        return Array.from(this.subscriptionsBySubscriberId.values()).flat();
    }
}

export const metricSubscriptionRegistry = new MetricSubscriptionRegistry();

function compareMetricSubscriptions(first: MetricSubscription, second: MetricSubscription): number {
    return buildMetricSubscriptionKey(first).localeCompare(buildMetricSubscriptionKey(second));
}

function deduplicateMetricSubscriptions(
    sortedSubscriptions: readonly MetricSubscription[],
): readonly MetricSubscription[] {
    const uniqueSubscriptions: MetricSubscription[] = [];
    let previousSubscriptionKey: string | null = null;

    for (const subscription of sortedSubscriptions) {
        const subscriptionKey = buildMetricSubscriptionKey(subscription);

        if (subscriptionKey !== previousSubscriptionKey) {
            uniqueSubscriptions.push(subscription);
            previousSubscriptionKey = subscriptionKey;
        }
    }

    return uniqueSubscriptions;
}

function buildMetricSubscriptionKey(subscription: MetricSubscription): string {
    return JSON.stringify([
        subscription.subscriberId,
        subscription.metricKey,
        subscription.sourceScopeId,
        subscription.failureMode,
        subscription.intervalMilliseconds,
        subscription.sourceCandidates.map(sourceCandidate => sourceCandidate.sourceId),
    ]);
}

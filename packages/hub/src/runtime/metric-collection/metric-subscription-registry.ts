import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
} from "../sources/metric-read-plan";

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
 * its own cadence.
 */
export interface MetricSubscription {
    readonly subscriberId: string;
    readonly metricKey: string;
    readonly sourceScopeId: string;
    readonly sourceCandidates: readonly MetricSubscriptionSourceCandidate[];
    readonly failureMode: MetricSubscriptionFailureMode;
    readonly intervalMilliseconds: number;
}

/**
 * Registers one legacy read-plan subscription during the Phase 5c migration.
 *
 * @deprecated This bridge exists only while SchedulerBinding still owns
 * `MetricReadPlan`. A later cut should make actions register metric-key and
 * source-policy subscriptions directly.
 */
export interface RegisterMetricReadPlanSubscriptionBridgeOptions {
    readonly subscriberId: string;
    readonly readPlan: MetricReadPlan;
    readonly intervalMilliseconds: number;
}

/**
 * Minimal bridge writer used by SchedulerBinding during Slice 1.
 *
 * @deprecated SchedulerBinding should stop writing read-plan subscriptions when
 * actions register metric-key/source-policy subscriptions directly.
 */
export interface MetricReadPlanSubscriptionBridgeWriter {
    registerReadPlanBridge(options: RegisterMetricReadPlanSubscriptionBridgeOptions): void;
    unregister(subscriberId: string): void;
}

/**
 * Tracks visible metric collection subscriptions.
 *
 * It does not poll sources, render widgets, or deliver metric callbacks. It is
 * the registration-time fact table that later collector group planning reads.
 */
export class MetricSubscriptionRegistry implements MetricReadPlanSubscriptionBridgeWriter {
    private readonly subscriptionsBySubscriberId = new Map<string, readonly MetricSubscription[]>();
    private currentPlanningVersion = 0;

    get planningVersion(): number {
        return this.currentPlanningVersion;
    }

    /**
     * Registers a legacy read-plan subscription.
     *
     * @deprecated This bridge adapts the old multi-key read plan into final
     * per-metric subscription records until actions register them directly.
     */
    registerReadPlanBridge(options: RegisterMetricReadPlanSubscriptionBridgeOptions): void {
        const readPlan = normalizeMetricReadPlan(options.readPlan);
        const subscriptions = readPlan.metricKeys.map(metricKey => ({
            subscriberId: options.subscriberId,
            metricKey,
            sourceScopeId: readPlan.sourceScopeId,
            sourceCandidates: readPlan.sourceCandidates,
            failureMode: readPlan.failureMode,
            intervalMilliseconds: options.intervalMilliseconds,
        }));

        this.subscriptionsBySubscriberId.set(options.subscriberId, subscriptions);
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

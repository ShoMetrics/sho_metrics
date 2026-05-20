import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
} from "../sources/metric-read-plan";

/**
 * Registers one legacy read-plan subscription during the Phase 5c migration.
 *
 * @deprecated This bridge exists only while SchedulerBinding still owns
 * `MetricReadPlan`. Slice 2 should replace it with metric-key/source-policy
 * subscriptions consumed by CollectorGroupPlanner.
 */
export interface RegisterMetricReadPlanSubscriptionBridgeOptions {
    readonly subscriberId: string;
    readonly readPlan: MetricReadPlan;
    readonly intervalMilliseconds: number;
}

/**
 * One visible action's legacy request to keep a read plan fresh.
 *
 * @deprecated This is a bridge shape, not the final MetricSubscription model.
 * It is intentionally named after `MetricReadPlan` so new code does not treat
 * it as the long-term subscription contract.
 */
export interface MetricReadPlanSubscriptionBridge {
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
    private readonly readPlanBridgeSubscriptionsBySubscriberId = new Map<string, MetricReadPlanSubscriptionBridge>();
    private currentPlanningVersion = 0;

    get planningVersion(): number {
        return this.currentPlanningVersion;
    }

    /**
     * Registers a legacy read-plan subscription.
     *
     * @deprecated Slice 2 should replace this bridge with final subscription
     * records that carry metric key, source policy, and interval.
     */
    registerReadPlanBridge(options: RegisterMetricReadPlanSubscriptionBridgeOptions): void {
        this.readPlanBridgeSubscriptionsBySubscriberId.set(options.subscriberId, {
            subscriberId: options.subscriberId,
            readPlan: normalizeMetricReadPlan(options.readPlan),
            intervalMilliseconds: options.intervalMilliseconds,
        });
    }

    unregister(subscriberId: string): void {
        this.readPlanBridgeSubscriptionsBySubscriberId.delete(subscriberId);
    }

    invalidatePlans(): number {
        this.currentPlanningVersion += 1;
        return this.currentPlanningVersion;
    }

    /**
     * Lists legacy read-plan subscriptions for migration assertions.
     *
     * @deprecated Slice 2 should move grouping and minimum-interval decisions to
     * CollectorGroupPlanner and stop reading this bridge output.
     */
    listReadPlanBridgeSubscriptions(): readonly MetricReadPlanSubscriptionBridge[] {
        return Array.from(this.readPlanBridgeSubscriptionsBySubscriberId.values());
    }
}

export const metricSubscriptionRegistry = new MetricSubscriptionRegistry();

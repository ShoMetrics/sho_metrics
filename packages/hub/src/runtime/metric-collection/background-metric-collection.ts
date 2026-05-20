import { logger } from "../../logging/logger";
import { metricStore } from "../metric-store";
import { BackoffPolicy } from "../sources/backoff-policy";
import {
    createDefaultSourceRegistry,
    type SourceRegistry,
} from "../sources/source-registry";
import { CollectorGroupPlanner } from "./collector-group-planner";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import {
    MetricSubscriptionRegistry,
    type RegisterMetricReadPlanSubscriptionBridgeOptions,
} from "./metric-subscription-registry";

const log = logger.for("BackgroundMetricCollection");
const BACKOFF_RETRY_MILLISECONDS = 2000;

interface BackgroundMetricCollectionOptions {
    readonly subscriptionRegistry: MetricSubscriptionRegistry;
    readonly collectorGroupPlanner: CollectorGroupPlanner;
    readonly collectorGroupSupervisor: CollectorGroupSupervisor;
    readonly sourceRegistry?: Pick<SourceRegistry, "dispose">;
}

/**
 * Coordinates subscription-driven background collection.
 *
 * This is a composition root for the Phase 5c migration. It wires the
 * subscription registry, registration-time planner, and runner supervisor
 * together, but it does not render widgets or read MetricStore.
 */
export class BackgroundMetricCollection {
    private readonly subscriptionRegistry: MetricSubscriptionRegistry;
    private readonly collectorGroupPlanner: CollectorGroupPlanner;
    private readonly collectorGroupSupervisor: CollectorGroupSupervisor;
    private readonly sourceRegistry?: Pick<SourceRegistry, "dispose">;

    constructor(options: BackgroundMetricCollectionOptions) {
        this.subscriptionRegistry = options.subscriptionRegistry;
        this.collectorGroupPlanner = options.collectorGroupPlanner;
        this.collectorGroupSupervisor = options.collectorGroupSupervisor;
        this.sourceRegistry = options.sourceRegistry;
    }

    /**
     * Registers one migration-era read-plan subscription.
     *
     * This is a collection-only subscription. Rendering is owned by the action
     * render cadence; this method only keeps source samples fresh in MetricStore.
     */
    registerReadPlanBridgeSubscription(
        options: RegisterMetricReadPlanSubscriptionBridgeOptions,
    ): () => void {
        this.subscriptionRegistry.registerReadPlanBridge(options);
        this.reconcileCollectorGroups();

        return () => {
            this.subscriptionRegistry.unregister(options.subscriberId);
            this.reconcileCollectorGroups();
        };
    }

    /** Stops background loops and releases source resources owned by this root. */
    dispose(): void {
        this.collectorGroupSupervisor.stopAll();
        this.sourceRegistry?.dispose();
    }

    private reconcileCollectorGroups(): void {
        const subscriptions = this.subscriptionRegistry.listSubscriptions();
        const collectorGroups = this.collectorGroupPlanner.plan(subscriptions);

        log.debug(() => [
            "reconcileCollectorGroups",
            `subscriptionCount=${subscriptions.length}`,
            `collectorGroupCount=${collectorGroups.length}`,
        ].join(" "));

        this.collectorGroupSupervisor.reconcile(collectorGroups);
    }
}

// TODO(Phase 5c Slice 6): Merge this source registry with the remaining
// Scheduler/SourceRunner registry when the old collection path is deleted.
// During migration, RAM uses this background-owned registry while unmigrated
// actions still use Scheduler's registry.
const backgroundSourceRegistry: SourceRegistry = createDefaultSourceRegistry();

export const backgroundMetricCollection = new BackgroundMetricCollection({
    subscriptionRegistry: new MetricSubscriptionRegistry(),
    collectorGroupPlanner: new CollectorGroupPlanner(backgroundSourceRegistry),
    collectorGroupSupervisor: new CollectorGroupSupervisor({
        sourceRegistry: backgroundSourceRegistry,
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(Date.now, BACKOFF_RETRY_MILLISECONDS),
    }),
    sourceRegistry: backgroundSourceRegistry,
});

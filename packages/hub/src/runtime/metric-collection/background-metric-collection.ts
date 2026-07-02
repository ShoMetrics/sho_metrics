import { logger } from "../../logging/logger";
import { metricStore } from "../metric-store";
import { BackoffPolicy } from "../sources/backoff-policy";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type SourceCandidate,
    selectMetricReadRouteSourceCandidates,
} from "../source-routing/metric-read-plan";
import {
    createDefaultSourceRegistry,
    type SourceRegistry,
} from "../sources/source-registry";
import type { MetricDescriptorSnapshot, SourceClientStatus } from "../sources/source-client";
import { CollectorGroupPlanner } from "./collector-group-planner";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import {
    MetricSubscriptionRegistry,
    type RegisterMetricSubscriptionsOptions,
} from "./metric-subscription-registry";
import {
    SourcePlanningMetadataRegistry,
    sourcePlanningMetadataRegistry,
} from "./source-planning-metadata-registry";
import { MetricStoreIngestDiagnostics } from "./metric-store-ingest-diagnostics";
import type { SourceMetadataInvalidation } from "../sources/source-planning-metadata";
import { monotonicNowMilliseconds } from "../../shared/clock";
import {
    subscribeProcessResume,
    type ProcessResumeEvent,
    type ProcessResumeListener,
} from "../../shared/process-resume-detector";
import type {
    MetricCollectionRefreshReason,
    MetricCollectionSubscriberRefreshResult,
} from "./metric-collection-refresh";

const log = logger.for("BackgroundMetricCollection");
const BACKOFF_RETRY_MILLISECONDS = 2000;

interface BackgroundMetricCollectionOptions {
    readonly subscriptionRegistry: MetricSubscriptionRegistry;
    readonly collectorGroupPlanner: CollectorGroupPlanner;
    readonly collectorGroupSupervisor: CollectorGroupSupervisor;
    readonly sourceMetadataRegistry: SourcePlanningMetadataRegistry;
    readonly sourceRegistry: SourceRegistry;
    readonly metricStoreIngestDiagnostics?: MetricStoreIngestDiagnostics;
    readonly subscribeProcessResume?: ((listener: ProcessResumeListener) => () => void) | undefined;
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
    private readonly sourceMetadataRegistry: SourcePlanningMetadataRegistry;
    private readonly sourceRegistry: SourceRegistry;
    private readonly metricStoreIngestDiagnostics: MetricStoreIngestDiagnostics;
    private readonly unsubscribeSourceMetadataInvalidations: () => void;
    private readonly unsubscribeProcessResume: () => void;

    constructor(options: BackgroundMetricCollectionOptions) {
        this.subscriptionRegistry = options.subscriptionRegistry;
        this.collectorGroupPlanner = options.collectorGroupPlanner;
        this.collectorGroupSupervisor = options.collectorGroupSupervisor;
        this.sourceMetadataRegistry = options.sourceMetadataRegistry;
        this.sourceRegistry = options.sourceRegistry;
        this.metricStoreIngestDiagnostics = options.metricStoreIngestDiagnostics ?? new MetricStoreIngestDiagnostics();
        this.unsubscribeSourceMetadataInvalidations = this.sourceRegistry.subscribeSourceMetadataInvalidations(
            invalidation => {
                this.notifySourceMetadataChanged(invalidation);
            },
        );
        this.unsubscribeProcessResume = (options.subscribeProcessResume ?? subscribeProcessResume)(event => {
            this.requestResumeRecoveryRefresh(event);
        });
    }

    /**
     * Registers one action's collection subscriptions.
     *
     * This is collection-only state. Rendering is owned by the action render
     * interval; this method only keeps source samples fresh in MetricStore.
     */
    registerSubscriptions(options: RegisterMetricSubscriptionsOptions): () => void {
        this.subscriptionRegistry.register(options);
        this.reconcileCollectorGroups();

        return () => {
            this.subscriptionRegistry.unregister(options.subscriberId);
            this.reconcileCollectorGroups();
        };
    }

    /**
     * Reconciles collector groups after source planning metadata changes.
     *
     * This is a thin composition-root entry point. It records the fingerprint,
     * invalidates cached plans, and reconciles active subscriptions. Source
     * health, connection recovery, descriptor parsing, and fallback remain
     * owned by their existing data-plane boundaries.
     */
    notifySourceMetadataChanged(invalidation: SourceMetadataInvalidation): boolean {
        if (!this.sourceMetadataRegistry.recordInvalidation(invalidation)) {
            log.debug(() => [
                "sourceMetadataUnchanged",
                `sourceScopeId=${invalidation.sourceScopeId}`,
                `sourceProfileId=${invalidation.sourceProfileId}`,
                `reason=${invalidation.reason}`,
            ].join(" "));
            return false;
        }

        const planningVersion = this.subscriptionRegistry.invalidatePlans();

        log.debug(() => [
            "sourceMetadataChanged",
            `sourceScopeId=${invalidation.sourceScopeId}`,
            `sourceProfileId=${invalidation.sourceProfileId}`,
            `reason=${invalidation.reason}`,
            `planningVersion=${planningVersion}`,
        ].join(" "));

        this.reconcileCollectorGroups();
        return true;
    }

    /**
     * Performs one low-frequency lifecycle refresh for runtime option caches.
     *
     * Property Inspector option refreshes need to nudge source-owned discovery
     * such as network interfaces and disk volumes. This method writes
     * source/profile-scoped samples and intentionally does not trigger render
     * callbacks or replace the background collection interval.
     *
     * This is a lifecycle-only escape hatch. It bypasses CollectorGroupRunner
     * backoff, in-flight dedupe, and generation guards, so callers must not use
     * it from render ticks, polling loops, or any other hot path.
     */
    async refreshReadPlanOnce(readPlan: MetricReadPlan): Promise<void> {
        const normalizedReadPlan = normalizeMetricReadPlan(readPlan);
        const metricKeysBySourceId = new Map<string, Set<string>>();

        for (const metric of normalizedReadPlan.metrics) {
            for (const sourceCandidate of selectMetricReadRouteSourceCandidates(metric)) {
                const metricKeys = metricKeysBySourceId.get(sourceCandidate.sourceId);

                if (metricKeys) {
                    metricKeys.add(metric.metricKey);
                    continue;
                }

                metricKeysBySourceId.set(sourceCandidate.sourceId, new Set([metric.metricKey]));
            }
        }

        await Promise.all(Array.from(metricKeysBySourceId.entries()).map(([sourceId, metricKeys]) => (
            this.refreshSourceCandidateOnce({ sourceId }, Array.from(metricKeys).sort())
        )));
    }

    /**
     * Requests one on-demand collection refresh for a live widget subscriber.
     *
     * This is the action-facing manual refresh entry point. It delegates to the
     * collector supervisor so runner-owned pending, backoff, and generation
     * guards remain the only source-read arbitration policy.
     */
    async requestSubscriberRefresh(
        subscriberId: string,
        reason: MetricCollectionRefreshReason,
    ): Promise<MetricCollectionSubscriberRefreshResult> {
        return await this.collectorGroupSupervisor.requestSubscriberRefresh(subscriberId, reason);
    }

    /** Reads source-owned runtime status without performing source I/O. */
    readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        return this.sourceRegistry.readCachedSourceStatus(sourceId);
    }

    /** Reads source-owned metric descriptors without registering collection demand. */
    async readSourceMetricDescriptors(
        sourceId: string,
        metricKeys: readonly string[] = [],
    ): Promise<MetricDescriptorSnapshot> {
        const sourceClient = this.sourceRegistry.resolveSourceClient(sourceId);

        if (!sourceClient?.listMetricDescriptors) {
            throw new Error(`Source ${sourceId} does not expose metric descriptors.`);
        }

        return await sourceClient.listMetricDescriptors(metricKeys);
    }

    /** Stops background loops and releases source resources owned by this root. */
    dispose(): void {
        this.unsubscribeProcessResume();
        this.unsubscribeSourceMetadataInvalidations();
        this.collectorGroupSupervisor.stopAll();
        this.sourceRegistry.dispose();
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

    private requestResumeRecoveryRefresh(event: ProcessResumeEvent): void {
        log.info(() => [
            "resumeRecoveryRefreshRequested",
            `owner=${event.owner}`,
            `gapMs=${event.gapMilliseconds}`,
        ].join(" "));

        this.collectorGroupSupervisor.requestAllRefresh("resumeRecovery").catch(error => {
            log.warn(() => [
                "resumeRecoveryRefreshFailed",
                `owner=${event.owner}`,
                `gapMs=${event.gapMilliseconds}`,
                `error=${String(error)}`,
            ].join(" "));
        });
    }

    private async refreshSourceCandidateOnce(
        sourceCandidate: SourceCandidate,
        metricKeys: readonly string[],
    ): Promise<void> {
        const sourceClient = this.sourceRegistry.resolveSourceClient(sourceCandidate.sourceId);

        if (!sourceClient) {
            log.warn(() => [
                "runtimeOptionRefreshSourceMissing",
                `sourceId=${sourceCandidate.sourceId}`,
                `metricCount=${metricKeys.length}`,
            ].join(" "));
            return;
        }

        try {
            const readResult = await sourceClient.readSnapshot(metricKeys);
            const ingestReport = metricStore.ingest(sourceCandidate.sourceId, readResult.snapshot, {
                valueMetadata: readResult.valueMetadata,
                unavailableMetrics: readResult.unavailableMetrics,
            });
            // This refresh path bypasses CollectorGroupRunner, so it must attach
            // the source context for MetricStore's dropped-value report here.
            this.metricStoreIngestDiagnostics.record({
                sourceId: sourceCandidate.sourceId,
                groupKind: "runtimeOptionRefresh",
                groupId: "manual",
            }, ingestReport);
        } catch (error) {
            log.warn(() => [
                "runtimeOptionRefreshFailed",
                `sourceId=${sourceCandidate.sourceId}`,
                `metricCount=${metricKeys.length}`,
                `error=${String(error)}`,
            ].join(" "));
        }
    }
}

const backgroundSourceRegistry: SourceRegistry = createDefaultSourceRegistry();

export const backgroundMetricCollection = new BackgroundMetricCollection({
    subscriptionRegistry: new MetricSubscriptionRegistry(),
    collectorGroupPlanner: new CollectorGroupPlanner(backgroundSourceRegistry),
    collectorGroupSupervisor: new CollectorGroupSupervisor({
        sourceRegistry: backgroundSourceRegistry,
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(monotonicNowMilliseconds, BACKOFF_RETRY_MILLISECONDS),
    }),
    sourceMetadataRegistry: sourcePlanningMetadataRegistry,
    sourceRegistry: backgroundSourceRegistry,
});

import { resolveMetricPollingGroupId } from "../metric-polling-groups";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import type { SourceRegistry } from "../sources/source-registry";
import type {
    MetricSubscription,
    MetricSubscriptionSourceCandidate,
} from "./metric-subscription-registry";

/** Shared fields for one planned background collection loop. */
interface PlannedCollectorGroupBase {
    /** Stable serialized runtime identity for supervisor maps and logs. */
    readonly collectorGroupKey: string;

    /** Source scope from the subscription that requested this collection. */
    readonly sourceScopeId: string;

    /** Source client/profile id that owns the background I/O. */
    readonly sourceId: string;

    /** Metric keys to ask this source client to refresh together. */
    readonly metricKeys: readonly string[];

    /** Minimum active requested interval among subscribers in this group. */
    readonly intervalMilliseconds: number;

    /** Visible subscribers that currently depend on this group. */
    readonly subscriberIds: readonly string[];
}

/** Planned loop for a source-declared collector/cost group. */
export interface PlannedSourceDeclaredCollectorGroup extends PlannedCollectorGroupBase {
    readonly groupKind: "sourceDeclared";
    readonly pollingGroupId: string;
}

/** Planned isolated loop for a metric whose source ownership is not known yet. */
export interface PlannedUnknownMetricCollectorGroup extends PlannedCollectorGroupBase {
    readonly groupKind: "unknownMetric";
    readonly isolatedMetricKey: string;
}

/** One planned background collection loop for a source/profile polling group. */
export type PlannedCollectorGroup =
    | PlannedSourceDeclaredCollectorGroup
    | PlannedUnknownMetricCollectorGroup;

interface CollectorGroupAccumulatorBase {
    readonly collectorGroupKey: string;
    readonly sourceScopeId: string;
    readonly sourceId: string;
    readonly metricKeys: Set<string>;
    readonly subscriberIds: Set<string>;
    intervalMilliseconds: number;
}

interface SourceDeclaredCollectorGroupAccumulator extends CollectorGroupAccumulatorBase {
    readonly groupKind: "sourceDeclared";
    readonly pollingGroupId: string;
}

interface UnknownMetricCollectorGroupAccumulator extends CollectorGroupAccumulatorBase {
    readonly groupKind: "unknownMetric";
    readonly isolatedMetricKey: string;
}

type CollectorGroupAccumulator =
    | SourceDeclaredCollectorGroupAccumulator
    | UnknownMetricCollectorGroupAccumulator;

/**
 * Plans registration-time background collector groups from active subscriptions.
 *
 * This is not the old Scheduler polling-group planner. Scheduler groups had to
 * include the whole fallback signature because SourceRunner did fallback I/O
 * inside a poll. Background collection runs each source/profile group
 * independently; read-time fallback composition chooses between the scoped
 * samples later.
 */
export class CollectorGroupPlanner {
    constructor(private readonly sourceRegistry: SourceRegistry) {}

    /**
     * Plans active subscriptions into source-scoped background collector groups.
     *
     * This is a pure registration-time planning step: it may read cached
     * source-declared polling group metadata through the SourceRegistry, but it
     * must not start timers, call source I/O, mutate MetricStore, or update
     * subscription state.
     */
    plan(subscriptions: readonly MetricSubscription[]): readonly PlannedCollectorGroup[] {
        const resolutionsBySourceId = this.resolvePollingGroupsBySourceId(subscriptions);
        const groupsByKey = new Map<string, CollectorGroupAccumulator>();

        for (const subscription of subscriptions) {
            for (const sourceCandidate of selectSourceCandidatesForFailureMode(subscription)) {
                const resolution = resolutionsBySourceId.get(sourceCandidate.sourceId)?.get(subscription.metricKey)
                    ?? { state: "unknown" };
                const groupIdentity = resolveCollectorGroupIdentity({
                    sourceScopeId: subscription.sourceScopeId,
                    sourceId: sourceCandidate.sourceId,
                    metricKey: subscription.metricKey,
                    resolution,
                });

                if (!groupIdentity) {
                    continue;
                }

                const existingGroup = groupsByKey.get(groupIdentity.collectorGroupKey);

                if (existingGroup) {
                    existingGroup.metricKeys.add(subscription.metricKey);
                    existingGroup.subscriberIds.add(subscription.subscriberId);
                    existingGroup.intervalMilliseconds = Math.min(
                        existingGroup.intervalMilliseconds,
                        subscription.intervalMilliseconds,
                    );
                    continue;
                }

                groupsByKey.set(groupIdentity.collectorGroupKey, {
                    ...groupIdentity,
                    sourceScopeId: subscription.sourceScopeId,
                    sourceId: sourceCandidate.sourceId,
                    metricKeys: new Set([subscription.metricKey]),
                    subscriberIds: new Set([subscription.subscriberId]),
                    intervalMilliseconds: subscription.intervalMilliseconds,
                });
            }
        }

        return Array.from(groupsByKey.values())
            .map(buildPlannedCollectorGroup);
    }

    private resolvePollingGroupsBySourceId(
        subscriptions: readonly MetricSubscription[],
    ): ReadonlyMap<string, ReadonlyMap<string, SourceMetricPollingGroupResolution>> {
        const metricKeysBySourceId = new Map<string, Set<string>>();

        for (const subscription of subscriptions) {
            for (const sourceCandidate of selectSourceCandidatesForFailureMode(subscription)) {
                const metricKeys = metricKeysBySourceId.get(sourceCandidate.sourceId);

                if (metricKeys) {
                    metricKeys.add(subscription.metricKey);
                    continue;
                }

                metricKeysBySourceId.set(sourceCandidate.sourceId, new Set([subscription.metricKey]));
            }
        }

        const resolutionsBySourceId = new Map<string, ReadonlyMap<string, SourceMetricPollingGroupResolution>>();

        for (const [sourceId, metricKeys] of metricKeysBySourceId.entries()) {
            const normalizedMetricKeys = Array.from(metricKeys).sort();
            const sourceClient = this.sourceRegistry.resolveSourceClient(sourceId);

            // Temporary migration bridge for legacy sources that have not yet
            // declared ownership. It must disappear with the Phase 5b bridge.
            resolutionsBySourceId.set(
                sourceId,
                sourceClient?.resolveMetricPollingGroups?.(normalizedMetricKeys)
                    ?? resolveMetricKeysWithStaticBridge(normalizedMetricKeys),
            );
        }

        return resolutionsBySourceId;
    }
}

function selectSourceCandidatesForFailureMode(
    subscription: MetricSubscription,
): readonly MetricSubscriptionSourceCandidate[] {
    return subscription.failureMode === "fallback"
        ? subscription.sourceCandidates
        : subscription.sourceCandidates.slice(0, 1);
}

function resolveMetricKeysWithStaticBridge(
    metricKeys: readonly string[],
): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
    const resolutions = new Map<string, SourceMetricPollingGroupResolution>();

    for (const metricKey of metricKeys) {
        const pollingGroupId = resolveMetricPollingGroupId(metricKey);
        resolutions.set(metricKey, pollingGroupId === "unknown"
            ? { state: "unknown" }
            : { state: "owned", pollingGroupId });
    }

    return resolutions;
}

type CollectorGroupIdentity =
    | {
        readonly collectorGroupKey: string;
        readonly groupKind: "sourceDeclared";
        readonly pollingGroupId: string;
    }
    | {
        readonly collectorGroupKey: string;
        readonly groupKind: "unknownMetric";
        readonly isolatedMetricKey: string;
    };

function resolveCollectorGroupIdentity(options: {
    readonly sourceScopeId: string;
    readonly sourceId: string;
    readonly metricKey: string;
    readonly resolution: SourceMetricPollingGroupResolution;
}): CollectorGroupIdentity | null {
    switch (options.resolution.state) {
        case "owned":
            return {
                collectorGroupKey: buildCollectorGroupKey([
                    options.sourceScopeId,
                    options.sourceId,
                    "sourceDeclared",
                    options.resolution.pollingGroupId,
                ]),
                groupKind: "sourceDeclared",
                pollingGroupId: options.resolution.pollingGroupId,
            };
        case "unknown":
            return {
                collectorGroupKey: buildCollectorGroupKey([
                    options.sourceScopeId,
                    options.sourceId,
                    "unknownMetric",
                    options.metricKey,
                ]),
                groupKind: "unknownMetric",
                isolatedMetricKey: options.metricKey,
            };
        case "unsupported":
            return null;
    }
}

function buildPlannedCollectorGroup(group: CollectorGroupAccumulator): PlannedCollectorGroup {
    const base = {
        collectorGroupKey: group.collectorGroupKey,
        sourceScopeId: group.sourceScopeId,
        sourceId: group.sourceId,
        metricKeys: Array.from(group.metricKeys).sort(),
        intervalMilliseconds: group.intervalMilliseconds,
        subscriberIds: Array.from(group.subscriberIds).sort(),
    };

    switch (group.groupKind) {
        case "sourceDeclared":
            return {
                ...base,
                groupKind: "sourceDeclared",
                pollingGroupId: group.pollingGroupId,
            };
        case "unknownMetric":
            return {
                ...base,
                groupKind: "unknownMetric",
                isolatedMetricKey: group.isolatedMetricKey,
            };
    }
}

function buildCollectorGroupKey(parts: readonly string[]): string {
    return JSON.stringify([
        ...parts,
    ]);
}

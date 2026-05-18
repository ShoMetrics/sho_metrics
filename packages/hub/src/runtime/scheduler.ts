import type { MetricSnapshot } from "./sources/metric-source";
import { metricStore } from "./metric-store";
import { logger } from "../logging/logger";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
} from "./sources/metric-read-plan";
import { DefaultSourceRunner, type SourceRunner } from "./sources/source-runner";
import { createDefaultSourceRegistry } from "./sources/source-registry";

const log = logger.for("Scheduler");

export type MetricsSnapshot = MetricSnapshot;

export type MetricSubscriber = (metrics: MetricsSnapshot) => void;

interface SubscriptionOptions {
    pollingIntervalMilliseconds?: number;
    readPlan: MetricReadPlan;
}

export interface MetricSnapshotStore {
    ingest(sourceScopeId: string, snapshot: MetricSnapshot): void;
}

interface SubscriberRecord {
    callback: MetricSubscriber;
    readPlan: MetricReadPlan;
    groupKey: string;
    pollingIntervalMilliseconds: number;
}

interface DueSubscriberGroup {
    groupKey: string;
    readPlan: MetricReadPlan;
    pollingIntervalMilliseconds: number;
    subscribers: readonly SubscriberRecord[];
}

/**
 * Central Scheduler that polls a SourceRunner for due metric/frequency groups.
 * Subscribers sharing the same frequency and source scope receive one coalesced snapshot.
 */
export class Scheduler {
    private readonly subscribers = new Map<MetricSubscriber, SubscriberRecord>();
    private intervalId?: NodeJS.Timeout;
    private readonly activePolls = new Set<string>();
    private readonly sourceRunner: SourceRunner;
    private readonly snapshotStore: MetricSnapshotStore;
    private readonly nextPollTimestampByGroup = new Map<string, number>();

    private static readonly TICK_INTERVAL_MS = 1000;
    private static readonly DEFAULT_POLLING_INTERVAL_MS = 1000;
    private static readonly ALLOWED_POLLING_INTERVALS_MS = new Set([1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000]);

    constructor(sourceRunner: SourceRunner, snapshotStore: MetricSnapshotStore = metricStore) {
        this.sourceRunner = sourceRunner;
        this.snapshotStore = snapshotStore;
    }

    /**
     * Subscribes a metric consumer to one polling group.
     *
     * Pass every metric key the consumer needs in one subscription. A subscriber
     * added after a poll starts is scheduled for a later tick; it is not appended
     * to the in-flight poll.
     */
    subscribe(callback: MetricSubscriber, options: SubscriptionOptions): () => void {
        const pollingIntervalMilliseconds = Scheduler.normalizePollingIntervalMilliseconds(
            options.pollingIntervalMilliseconds,
        );
        const readPlan = normalizeMetricReadPlan(options.readPlan);
        const groupKey = Scheduler.buildGroupKey(pollingIntervalMilliseconds, readPlan);

        this.subscribers.set(callback, {
            callback,
            readPlan,
            groupKey,
            pollingIntervalMilliseconds,
        });
        this.nextPollTimestampByGroup.set(groupKey, 0);
        this.start();

        return () => {
            this.subscribers.delete(callback);
            this.removeGroupScheduleIfUnused(groupKey);

            if (this.subscribers.size === 0) {
                this.stop();
            }
        };
    }

    /**
     * Polls one metric set outside the subscriber schedule and ingests it.
     *
     * This is for low-frequency lifecycle refreshes, such as refreshing runtime
     * option lists when Property Inspector opens. It does not notify
     * subscribers; scheduled polling remains the owner of regular updates.
     */
    async refreshMetrics(readPlan: MetricReadPlan): Promise<MetricsSnapshot> {
        const normalizedReadPlan = normalizeMetricReadPlan(readPlan);
        const snapshot = await this.sourceRunner.poll(normalizedReadPlan);

        this.snapshotStore.ingest(normalizedReadPlan.sourceScopeId, snapshot);

        return snapshot;
    }

    /** Stops scheduled polling and releases source resources owned by this scheduler. */
    dispose(): void {
        this.stop();
        this.subscribers.clear();
        this.sourceRunner.dispose();
    }

    private start(): void {
        if (this.intervalId) {
            return;
        }

        log.info("Starting");
        this.pollDueSubscriberGroups().catch(error => {
            log.error(() => `Initial poll error: ${String(error)}`);
        });
        this.intervalId = setInterval(() => {
            this.pollDueSubscriberGroups().catch(error => {
                log.error(() => `Poll error: ${String(error)}`);
            });
        }, Scheduler.TICK_INTERVAL_MS);
    }

    private stop(): void {
        if (this.intervalId) {
            log.info("Stopping (no subscribers)");
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        this.activePolls.clear();
        this.nextPollTimestampByGroup.clear();
    }

    private async pollDueSubscriberGroups(): Promise<void> {
        if (this.subscribers.size === 0) {
            return;
        }

        const currentTimestampMilliseconds = Date.now();
        const dueSubscriberGroups = this.getDueSubscriberGroups(currentTimestampMilliseconds);

        await Promise.all(dueSubscriberGroups.map(group => this.pollSubscriberGroup(group)));
    }

    private getDueSubscriberGroups(currentTimestampMilliseconds: number): DueSubscriberGroup[] {
        const subscriberGroups = new Map<string, DueSubscriberGroup>();

        for (const subscriber of this.subscribers.values()) {
            const groupKey = subscriber.groupKey;
            const nextPollTimestampMilliseconds = this.nextPollTimestampByGroup.get(groupKey) ?? 0;

            if (
                currentTimestampMilliseconds < nextPollTimestampMilliseconds
                || this.activePolls.has(groupKey)
            ) {
                continue;
            }

            const existingGroup = subscriberGroups.get(groupKey);

            if (existingGroup) {
                const readPlan = Scheduler.mergeGroupReadPlans(
                    existingGroup.readPlan,
                    subscriber.readPlan,
                );
                subscriberGroups.set(groupKey, {
                    ...existingGroup,
                    readPlan,
                    subscribers: [...existingGroup.subscribers, subscriber],
                });
                continue;
            }

            subscriberGroups.set(groupKey, {
                groupKey,
                readPlan: subscriber.readPlan,
                pollingIntervalMilliseconds: subscriber.pollingIntervalMilliseconds,
                subscribers: [subscriber],
            });
        }

        for (const subscriberGroup of subscriberGroups.values()) {
            this.nextPollTimestampByGroup.set(
                subscriberGroup.groupKey,
                currentTimestampMilliseconds + subscriberGroup.pollingIntervalMilliseconds,
            );
        }

        return Array.from(subscriberGroups.values());
    }

    private removeGroupScheduleIfUnused(groupKey: string): void {
        for (const subscriber of this.subscribers.values()) {
            if (subscriber.groupKey === groupKey) {
                return;
            }
        }

        this.nextPollTimestampByGroup.delete(groupKey);
    }

    private async pollSubscriberGroup(group: DueSubscriberGroup): Promise<void> {
        const pollStartTimestampMilliseconds = Date.now();
        this.activePolls.add(group.groupKey);

        try {
            log.debug(() => [
                "pollStart",
                `intervalMs=${group.pollingIntervalMilliseconds}`,
                `sourceScopeId=${group.readPlan.sourceScopeId}`,
                `metrics=${formatMetricKeys(group.readPlan.metricKeys)}`,
                `subscriberCount=${group.subscribers.length}`,
            ].join(" "));

            const snapshot = await this.sourceRunner.poll(group.readPlan);
            this.snapshotStore.ingest(group.readPlan.sourceScopeId, snapshot);
            const ingestTimestampMilliseconds = Date.now();

            log.debug(() => [
                "pollDone",
                `intervalMs=${group.pollingIntervalMilliseconds}`,
                `sourceScopeId=${group.readPlan.sourceScopeId}`,
                `metrics=${formatMetricKeys(group.readPlan.metricKeys)}`,
                `durationMs=${ingestTimestampMilliseconds - pollStartTimestampMilliseconds}`,
                `snapshotAgeMs=${ingestTimestampMilliseconds - Number(snapshot.timestampMs ?? ingestTimestampMilliseconds)}`,
                `metricCount=${Object.keys(snapshot.metrics ?? {}).length}`,
            ].join(" "));

            for (const subscriber of group.subscribers) {
                subscriber.callback(snapshot);
            }
        } catch (error) {
            log.error(() => [
                "Poll error",
                `sourceScopeId=${group.readPlan.sourceScopeId}`,
                `metrics=${formatMetricKeys(group.readPlan.metricKeys)}`,
                `error=${String(error)}`,
            ].join(" "));
        } finally {
            this.activePolls.delete(group.groupKey);
        }
    }

    private static normalizePollingIntervalMilliseconds(value: number | undefined): number {
        if (!value || !Scheduler.ALLOWED_POLLING_INTERVALS_MS.has(value)) {
            return Scheduler.DEFAULT_POLLING_INTERVAL_MS;
        }

        return value;
    }

    private static normalizeMetricKeys(metricKeys: readonly string[]): readonly string[] {
        return Array.from(new Set(metricKeys)).sort();
    }

    private static buildGroupKey(pollingIntervalMilliseconds: number, readPlan: MetricReadPlan): string {
        const normalizedReadPlan = normalizeMetricReadPlan(readPlan);

        // Metric keys are intentionally excluded. Subscribers with the same
        // cadence and source plan share one poll whose metric keys are merged
        // for that tick.
        return JSON.stringify([
            pollingIntervalMilliseconds,
            normalizedReadPlan.sourceScopeId,
            normalizedReadPlan.failureMode,
            normalizedReadPlan.sourceCandidates.map(candidate => candidate.sourceId),
        ]);
    }

    private static mergeGroupReadPlans(firstReadPlan: MetricReadPlan, secondReadPlan: MetricReadPlan): MetricReadPlan {
        return {
            ...firstReadPlan,
            metricKeys: Scheduler.normalizeMetricKeys([
                ...firstReadPlan.metricKeys,
                ...secondReadPlan.metricKeys,
            ]),
        };
    }
}

function formatMetricKeys(metricKeys: readonly string[]): string {
    return metricKeys.length > 0 ? metricKeys.join(",") : "all";
}

export const scheduler = new Scheduler(new DefaultSourceRunner(createDefaultSourceRegistry()));

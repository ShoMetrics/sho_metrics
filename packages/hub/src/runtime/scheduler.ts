import type { IMetricSource, IMetricSnapshot } from "./sources/source.interface";
import { BuiltinSource } from "./sources/builtin-source";
import { metricStore } from "./metric-store";
import { logger } from "../logging/logger";

const log = logger.for("Scheduler");

export type MetricsSnapshot = IMetricSnapshot;

type MetricSubscriber = (metrics: MetricsSnapshot) => void;

interface SubscriptionOptions {
    pollingIntervalMilliseconds?: number;
    metricKeys?: readonly string[];
}

interface SubscriberRecord {
    callback: MetricSubscriber;
    metricKeys: readonly string[];
    pollingIntervalMilliseconds: number;
}

interface DueSubscriberGroup {
    groupKey: string;
    metricKeys: readonly string[];
    pollingIntervalMilliseconds: number;
    subscribers: readonly SubscriberRecord[];
}

/**
 * Central Scheduler that polls an IMetricSource for due metric/frequency groups.
 * Subscribers sharing the same frequency and metric keys receive the same snapshot.
 */
class Scheduler {
    private subscribers = new Map<MetricSubscriber, SubscriberRecord>();
    private intervalId?: NodeJS.Timeout;
    private activePolls = new Set<string>();
    private source: IMetricSource;
    private nextPollTimestampByGroup = new Map<string, number>();

    private static readonly TICK_INTERVAL_MS = 1000;
    private static readonly DEFAULT_POLLING_INTERVAL_MS = 1000;
    private static readonly ALLOWED_POLLING_INTERVALS_MS = new Set([1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000]);

    constructor(source: IMetricSource) {
        this.source = source;
    }

    setSource(source: IMetricSource): void {
        log.info(() => `Switching source: ${this.source.sourceId} -> ${source.sourceId}`);
        this.source.dispose?.();
        this.source = source;
    }

    subscribe(callback: MetricSubscriber, options: SubscriptionOptions = {}): () => void {
        const pollingIntervalMilliseconds = Scheduler.normalizePollingIntervalMilliseconds(
            options.pollingIntervalMilliseconds,
        );
        const metricKeys = Scheduler.normalizeMetricKeys(options.metricKeys ?? []);
        const groupKey = Scheduler.buildGroupKey(pollingIntervalMilliseconds, metricKeys);

        this.subscribers.set(callback, {
            callback,
            metricKeys,
            pollingIntervalMilliseconds,
        });
        this.nextPollTimestampByGroup.set(groupKey, 0);
        this.start();

        return () => {
            this.subscribers.delete(callback);

            if (this.subscribers.size === 0) {
                this.stop();
            }
        };
    }

    private start(): void {
        if (this.intervalId) {
            return;
        }

        log.info(() => `Starting with source: ${this.source.sourceId}`);
        this.intervalId = setInterval(() => {
            this.pollDueSubscriberGroups().catch(error => {
                log.error(() => `Poll error: ${String(error)}`);
            });
        }, Scheduler.TICK_INTERVAL_MS);
        this.pollDueSubscriberGroups().catch(error => {
            log.error(() => `Initial poll error: ${String(error)}`);
        });
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
            const groupKey = Scheduler.buildGroupKey(
                subscriber.pollingIntervalMilliseconds,
                subscriber.metricKeys,
            );
            const nextPollTimestampMilliseconds = this.nextPollTimestampByGroup.get(groupKey) ?? 0;

            if (
                currentTimestampMilliseconds < nextPollTimestampMilliseconds
                || this.activePolls.has(groupKey)
            ) {
                continue;
            }

            const existingGroup = subscriberGroups.get(groupKey);

            if (existingGroup) {
                subscriberGroups.set(groupKey, {
                    ...existingGroup,
                    subscribers: [...existingGroup.subscribers, subscriber],
                });
                continue;
            }

            subscriberGroups.set(groupKey, {
                groupKey,
                metricKeys: subscriber.metricKeys,
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

    private async pollSubscriberGroup(group: DueSubscriberGroup): Promise<void> {
        const pollStartTimestampMilliseconds = Date.now();
        this.activePolls.add(group.groupKey);

        try {
            log.debug(() => [
                "pollStart",
                `intervalMs=${group.pollingIntervalMilliseconds}`,
                `metrics=${formatMetricKeys(group.metricKeys)}`,
                `subscriberCount=${group.subscribers.length}`,
            ].join(" "));

            const snapshot = await this.pollSource(group.metricKeys);
            metricStore.ingest(snapshot);
            const ingestTimestampMilliseconds = Date.now();

            log.debug(() => [
                "pollDone",
                `intervalMs=${group.pollingIntervalMilliseconds}`,
                `metrics=${formatMetricKeys(group.metricKeys)}`,
                `durationMs=${ingestTimestampMilliseconds - pollStartTimestampMilliseconds}`,
                `snapshotAgeMs=${ingestTimestampMilliseconds - Number(snapshot.timestampMs ?? ingestTimestampMilliseconds)}`,
                `metricCount=${Object.keys(snapshot.metrics ?? {}).length}`,
            ].join(" "));

            for (const subscriber of group.subscribers) {
                subscriber.callback(snapshot);
            }
        } catch (error) {
            log.error(() => `Poll error for metrics=${formatMetricKeys(group.metricKeys)}: ${String(error)}`);
        } finally {
            this.activePolls.delete(group.groupKey);
        }
    }

    private async pollSource(metricKeys: readonly string[]): Promise<MetricsSnapshot> {
        if (this.source.pollMetrics) {
            return this.source.pollMetrics(metricKeys);
        }

        return this.source.poll();
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

    private static buildGroupKey(pollingIntervalMilliseconds: number, metricKeys: readonly string[]): string {
        return `${pollingIntervalMilliseconds}:${metricKeys.join(",")}`;
    }
}

function formatMetricKeys(metricKeys: readonly string[]): string {
    return metricKeys.length > 0 ? metricKeys.join(",") : "all";
}

export const scheduler = new Scheduler(new BuiltinSource());

import streamDeck from "@elgato/streamdeck";
import type { IMetricSource, IMetricSnapshot } from "./sources/source.interface";
import { BuiltinSource } from "./sources/builtin-source";
import { metricStore } from "./metric-store";

export type MetricsSnapshot = IMetricSnapshot;

type MetricSubscriber = (metrics: MetricsSnapshot) => void;

/**
 * Central Scheduler that polls an IMetricSource at a fixed interval.
 * On each tick: polls source → ingests into MetricStore → notifies subscribers.
 */
class Scheduler {
    private subscribers = new Set<MetricSubscriber>();
    private intervalId?: NodeJS.Timeout;
    private isPolling = false;
    private source: IMetricSource;

    private static readonly POLL_INTERVAL_MS = 1000;

    constructor(source: IMetricSource) {
        this.source = source;
    }

    setSource(source: IMetricSource): void {
        streamDeck.logger.info(`[Scheduler] Switching source: ${this.source.sourceId} → ${source.sourceId}`);
        this.source.dispose?.();
        this.source = source;
    }

    subscribe(callback: MetricSubscriber): () => void {
        this.subscribers.add(callback);
        this.start();
        return () => {
            this.subscribers.delete(callback);
            if (this.subscribers.size === 0) {
                this.stop();
            }
        };
    }

    private start(): void {
        if (this.intervalId) return;
        streamDeck.logger.info(`[Scheduler] Starting with source: ${this.source.sourceId}`);
        this.intervalId = setInterval(async () => {
            if (this.isPolling) return;
            this.isPolling = true;
            try {
                const snapshot = await this.source.poll();
                metricStore.ingest(snapshot);
                for (const callback of this.subscribers) {
                    callback(snapshot);
                }
            } catch (error) {
                streamDeck.logger.error(`[Scheduler] Poll error: ${error}`);
            } finally {
                this.isPolling = false;
            }
        }, Scheduler.POLL_INTERVAL_MS);
    }

    private stop(): void {
        if (this.intervalId) {
            streamDeck.logger.info("[Scheduler] Stopping (no subscribers)");
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}

export const scheduler = new Scheduler(new BuiltinSource());

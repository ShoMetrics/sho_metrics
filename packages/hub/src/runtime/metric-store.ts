import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../rendering/widget-data";
import type { IMetricSnapshot } from "./sources/source.interface";

/**
 * Centralized metric history store.
 * Ingests IMetricSnapshot from the Scheduler and maintains per-key RingBuffers.
 * Actions query this for WidgetData.
 */
export class MetricStore {
    private store = new Map<string, RingBuffer<number>>();

    private static readonly HISTORY_SIZE = 60;

    /** Ingest an entire snapshot, recording all scalar metrics into ring buffers. */
    ingest(snapshot: IMetricSnapshot): void {
        if (!snapshot.metrics) return;

        for (const [key, value] of Object.entries(snapshot.metrics)) {
            if (value.scalar != null) {
                this.record(key, value.scalar);
            }
        }
    }

    private record(key: string, value: number): void {
        let buffer = this.store.get(key);
        if (!buffer) {
            buffer = new RingBuffer<number>(MetricStore.HISTORY_SIZE);
            this.store.set(key, buffer);
        }
        buffer.push(value);
    }

    /** Build a WidgetData for a specific metric key. */
    getWidgetData(key: string, label: string, unit: string, maxValue = 100): WidgetData {
        const buffer = this.store.get(key);
        const current = buffer?.latest ?? 0;
        return {
            current,
            progress: Math.min(Math.max(current / maxValue, 0), 1),
            history: buffer?.toArray() ?? [],
            unit,
            label,
        };
    }
}

/** Singleton MetricStore instance. */
export const metricStore = new MetricStore();

import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../rendering/widget-data";
import type { IMetricSnapshot } from "./sources/source.interface";

/**
 * Maintains per-metric scalar history and latest text values for renderers.
 */
export class MetricStore {
    private store = new Map<string, MetricRecord>();

    private static readonly HISTORY_SIZE = 60;

    ingest(snapshot: IMetricSnapshot): void {
        const sampleTimestampMilliseconds = Number(snapshot.timestampMs);

        for (const [key, value] of Object.entries(snapshot.metrics)) {
            if (value.data.case === "scalar") {
                this.record(key, value.data.value, sampleTimestampMilliseconds);
                continue;
            }

            if (value.data.case === "text") {
                this.recordText(key, value.data.value, sampleTimestampMilliseconds);
            }
        }
    }

    private record(key: string, value: number, timestampMilliseconds: number): void {
        let metricRecord = this.store.get(key);
        if (!metricRecord) {
            metricRecord = {
                buffer: new RingBuffer<number>(MetricStore.HISTORY_SIZE),
                timestampMilliseconds,
            };
            this.store.set(key, metricRecord);
        }

        metricRecord.buffer.push(value);
        metricRecord.timestampMilliseconds = timestampMilliseconds;
    }

    private recordText(key: string, value: string, timestampMilliseconds: number): void {
        let metricRecord = this.store.get(key);
        if (!metricRecord) {
            metricRecord = {
                buffer: new RingBuffer<number>(MetricStore.HISTORY_SIZE),
                timestampMilliseconds,
            };
            this.store.set(key, metricRecord);
        }

        metricRecord.text = value;
        metricRecord.timestampMilliseconds = timestampMilliseconds;
    }

    getWidgetData(key: string, label: string, unit: string, maxValue = 100): WidgetData {
        const metricRecord = this.store.get(key);
        const current = metricRecord?.buffer.latest ?? 0;
        return {
            current,
            progress: Math.min(Math.max(current / maxValue, 0), 1),
            history: metricRecord?.buffer.toArray() ?? [],
            unit,
            label,
            sampleTimestampMilliseconds: metricRecord?.timestampMilliseconds,
        };
    }

    getTextValue(key: string): string | undefined {
        return this.store.get(key)?.text;
    }

    /** Clear all sampled metric history and text values. Intended for isolated tests and source resets. */
    clear(): void {
        this.store.clear();
    }
}

interface MetricRecord {
    buffer: RingBuffer<number>;
    timestampMilliseconds: number;
    text?: string;
}

export const metricStore = new MetricStore();

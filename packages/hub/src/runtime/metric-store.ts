import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../view-rendering/widget-data";
import { readRequiredMetricSnapshotTimestampMilliseconds, type MetricSnapshot } from "./sources/metric-source";

/** Read-only view of metric history bound to one source scope. */
export interface MetricStoreReader {
    /** Builds renderer-facing widget data for one metric in the bound source scope. */
    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData;

    /** Reads the latest text value for one metric in the bound source scope. */
    getTextValue(metricKey: string): string | undefined;
}

/**
 * Maintains per-metric scalar history and latest text values for renderers.
 */
export class MetricStore {
    // Store layout is private to MetricStore:
    // - outer key: runtime source scope id, for example "local" or a future "remote:nuc".
    // - inner key: ShoMetrics metric id inside that source scope, for example "cpu.usage_percent" or "disk.throughput.read".
    // No separator or escaped string format is reserved here; adapters own validation before values reach this store.
    private store = new Map<string, SourceMetricStore>();

    private static readonly HISTORY_SIZE = 60;

    /** Creates a read-only metric view bound to one runtime source scope. */
    forScope(sourceScopeId: string): MetricStoreReader {
        return {
            getWidgetData: (metricKey, label, unit, maxValue) => this.readWidgetData(
                sourceScopeId,
                metricKey,
                label,
                unit,
                maxValue,
            ),
            getTextValue: metricKey => this.readTextValue(sourceScopeId, metricKey),
        };
    }

    /** Ingests a snapshot into the history owned by one runtime source scope. */
    ingest(sourceScopeId: string, snapshot: MetricSnapshot): void {
        const sampleTimestampMilliseconds = readRequiredMetricSnapshotTimestampMilliseconds(snapshot);
        const sourceStore = this.ensureSourceStore(sourceScopeId);

        for (const [metricKey, value] of Object.entries(snapshot.metrics)) {
            if (value.value.case === "scalar") {
                this.record(sourceStore, metricKey, value.value.value, sampleTimestampMilliseconds);
                continue;
            }

            if (value.value.case === "text") {
                this.recordText(sourceStore, metricKey, value.value.value, sampleTimestampMilliseconds);
            }
        }
    }

    private record(
        sourceStore: SourceMetricStore,
        metricKey: string,
        value: number,
        timestampMilliseconds: number,
    ): void {
        let metricRecord = sourceStore.get(metricKey);
        if (metricRecord?.kind !== "scalar") {
            metricRecord = {
                kind: "scalar",
                buffer: new RingBuffer<number>(MetricStore.HISTORY_SIZE),
                timestampMilliseconds,
            };
            sourceStore.set(metricKey, metricRecord);
        }

        metricRecord.buffer.push(value);
        metricRecord.timestampMilliseconds = timestampMilliseconds;
    }

    private recordText(
        sourceStore: SourceMetricStore,
        metricKey: string,
        value: string,
        timestampMilliseconds: number,
    ): void {
        sourceStore.set(metricKey, {
            kind: "text",
            text: value,
            timestampMilliseconds,
        });
    }

    private readWidgetData(
        sourceScopeId: string,
        metricKey: string,
        label: string,
        unit: string,
        maxValue = 100,
    ): WidgetData {
        const metricRecord = this.readRecord(sourceScopeId, metricKey);
        const current = metricRecord?.kind === "scalar" ? metricRecord.buffer.latest ?? 0 : 0;

        return {
            current,
            progress: Math.min(Math.max(current / maxValue, 0), 1),
            history: metricRecord?.kind === "scalar" ? metricRecord.buffer.toArray() : [],
            unit,
            label,
            sampleTimestampMilliseconds: metricRecord?.timestampMilliseconds,
        };
    }

    private readTextValue(sourceScopeId: string, metricKey: string): string | undefined {
        const metricRecord = this.readRecord(sourceScopeId, metricKey);
        return metricRecord?.kind === "text" ? metricRecord.text : undefined;
    }

    /** Clears all sampled metric history and text values. Intended for isolated tests and source resets. */
    clear(): void {
        this.store.clear();
    }

    private ensureSourceStore(sourceScopeId: string): SourceMetricStore {
        let sourceStore = this.store.get(sourceScopeId);
        if (!sourceStore) {
            sourceStore = new Map<string, MetricRecord>();
            this.store.set(sourceScopeId, sourceStore);
        }

        return sourceStore;
    }

    private readRecord(sourceScopeId: string, metricKey: string): MetricRecord | undefined {
        return this.store.get(sourceScopeId)?.get(metricKey);
    }
}

type SourceMetricStore = Map<string, MetricRecord>;

type MetricRecord = ScalarMetricRecord | TextMetricRecord;

interface ScalarMetricRecord {
    kind: "scalar";
    buffer: RingBuffer<number>;
    timestampMilliseconds: number;
}

interface TextMetricRecord {
    kind: "text";
    text: string;
    timestampMilliseconds: number;
}

/** Shared runtime metric store for the local plugin process. */
export const metricStore = new MetricStore();

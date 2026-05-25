import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../view-rendering/widget-data";
import { readRequiredMetricSnapshotTimestampMilliseconds, type MetricSnapshot } from "./sources/metric-source";
import type {
    MetricUnavailableReport,
    MetricValueAttribution,
} from "./sources/source-client";
import { MetricValueFreshness } from "./sources/source-client";

/** Read-only view of metric history bound to one source scope. */
export interface MetricStoreReader {
    /** Builds renderer-facing widget data for one metric in the bound source scope. */
    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData;

    /**
     * Builds renderer-facing widget data and reports which source scope supplied it.
     *
     * Fallback readers use this to expose runtime attribution without
     * reimplementing source selection outside the fallback decision point.
     */
    getWidgetDataWithAttribution(
        metricKey: string,
        label: string,
        unit: string,
        maxValue?: number,
    ): MetricWidgetDataReadResult;

    /** Reads the latest text value for one metric in the bound source scope. */
    getTextValue(metricKey: string): string | undefined;
}

/** Renderer-facing metric data plus source attribution. */
export interface MetricWidgetDataReadResult {
    readonly widgetData: WidgetData;
    readonly selectedSourceId: string | undefined;
}

/**
 * Maintains per-metric scalar history and latest text values for renderers.
 */
export class MetricStore {
    // Store layout is private to MetricStore:
    // - outer key: runtime source scope id. Composed samples may use logical
    //   scopes such as "local"; background collection writes source or profile
    //   scopes such as "node-system" so read-time fallback can compare
    //   candidates without overwriting them.
    // - inner key: ShoMetrics metric id inside that source scope, for example "cpu.usage_percent" or "disk.throughput.read".
    // No separator or escaped string format is reserved here; adapters own validation before values reach this store.
    private store = new Map<string, SourceMetricStore>();
    private unavailableMetricsBySourceScopeId = new Map<string, Map<string, MetricUnavailableReport>>();

    private static readonly HISTORY_SIZE = 60;

    /** Creates a read-only metric view bound to one runtime source scope. */
    forScope(sourceScopeId: string): MetricStoreReader {
        const readWidgetDataWithAttribution = (
            metricKey: string,
            label: string,
            unit: string,
            maxValue?: number,
        ): MetricWidgetDataReadResult => {
            const widgetData = this.readWidgetData(
                sourceScopeId,
                metricKey,
                label,
                unit,
                maxValue,
            );

            return {
                widgetData,
                selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                    ? undefined
                    : sourceScopeId,
            };
        };

        return {
            getWidgetData: (metricKey, label, unit, maxValue) => readWidgetDataWithAttribution(
                metricKey,
                label,
                unit,
                maxValue,
            ).widgetData,
            getWidgetDataWithAttribution: readWidgetDataWithAttribution,
            getTextValue: metricKey => this.readTextValue(sourceScopeId, metricKey),
        };
    }

    /** Ingests a snapshot into the history owned by one runtime source scope. */
    ingest(
        sourceScopeId: string,
        snapshot: MetricSnapshot,
        sourceMetadata: {
            readonly valueAttributions?: readonly MetricValueAttribution[];
            readonly unavailableMetrics?: readonly MetricUnavailableReport[];
        } = {},
    ): void {
        const sampleTimestampMilliseconds = readRequiredMetricSnapshotTimestampMilliseconds(snapshot);
        const sourceStore = this.ensureSourceStore(sourceScopeId);
        const valueAttributionsByMetricKey = new Map(
            sourceMetadata.valueAttributions?.map(attribution => [attribution.metricId, attribution]) ?? [],
        );

        for (const [metricKey, value] of Object.entries(snapshot.metrics)) {
            if (value.value.case === "scalar") {
                // Renderer-facing history accepts only finite scalar samples.
                // NaN and +/-Infinity keep the previous valid value available
                // instead of poisoning progress/history calculations.
                if (!Number.isFinite(value.value.value)) {
                    continue;
                }

                const valueAttribution = valueAttributionsByMetricKey.get(metricKey);
                this.record(
                    sourceStore,
                    metricKey,
                    value.value.value,
                    sampleTimestampMilliseconds,
                    valueAttribution === undefined
                        ? "fresh"
                        : readMetricStoreValueFreshness(valueAttribution.valueFreshness),
                );
                continue;
            }

            if (value.value.case === "text") {
                if (value.value.value.trim().length === 0) {
                    continue;
                }

                this.recordText(sourceStore, metricKey, value.value.value, sampleTimestampMilliseconds);
            }
        }

        if (sourceMetadata.unavailableMetrics) {
            this.recordUnavailableMetrics(sourceScopeId, sourceMetadata.unavailableMetrics);
        }
    }

    private record(
        sourceStore: SourceMetricStore,
        metricKey: string,
        value: number,
        timestampMilliseconds: number,
        valueFreshness: "fresh" | "retained",
    ): void {
        let metricRecord = sourceStore.get(metricKey);
        if (metricRecord?.kind !== "scalar") {
            metricRecord = {
                kind: "scalar",
                buffer: new RingBuffer<number>(MetricStore.HISTORY_SIZE),
                current: value,
                timestampMilliseconds,
            };
            sourceStore.set(metricKey, metricRecord);
        }

        metricRecord.current = value;
        metricRecord.timestampMilliseconds = timestampMilliseconds;

        if (valueFreshness === "fresh") {
            metricRecord.buffer.push(value);
        }
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
        const current = metricRecord?.kind === "scalar" ? metricRecord.current : 0;

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
        this.unavailableMetricsBySourceScopeId.clear();
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

    private recordUnavailableMetrics(
        sourceScopeId: string,
        unavailableMetrics: readonly MetricUnavailableReport[],
    ): void {
        let unavailableMetricsByMetricKey = this.unavailableMetricsBySourceScopeId.get(sourceScopeId);
        if (!unavailableMetricsByMetricKey) {
            unavailableMetricsByMetricKey = new Map<string, MetricUnavailableReport>();
            this.unavailableMetricsBySourceScopeId.set(sourceScopeId, unavailableMetricsByMetricKey);
        }

        for (const unavailableMetric of unavailableMetrics) {
            unavailableMetricsByMetricKey.set(unavailableMetric.metricId, unavailableMetric);
        }
    }
}

function readMetricStoreValueFreshness(valueFreshness: MetricValueFreshness): "fresh" | "retained" {
    return valueFreshness === MetricValueFreshness.FRESH ? "fresh" : "retained";
}

type SourceMetricStore = Map<string, MetricRecord>;

type MetricRecord = ScalarMetricRecord | TextMetricRecord;

interface ScalarMetricRecord {
    kind: "scalar";
    buffer: RingBuffer<number>;
    current: number;
    timestampMilliseconds: number;
}

interface TextMetricRecord {
    kind: "text";
    text: string;
    timestampMilliseconds: number;
}

/** Shared runtime metric store for the local plugin process. */
export const metricStore = new MetricStore();

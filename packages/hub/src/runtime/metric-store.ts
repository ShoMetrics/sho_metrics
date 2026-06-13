import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../view-rendering/widget-data";
import { readRequiredMetricSnapshotTimestampMilliseconds, type MetricSnapshot } from "./sources/metric-source";
import type {
    MetricUnavailableReport,
    MetricValueAttribution,
} from "./sources/source-client";

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
    readonly valueAttribution?: MetricValueAttribution;
    readonly unavailableMetric?: MetricUnavailableReport;
}

/**
 * Maintains per-metric scalar history and latest text values for renderers.
 */
export class MetricStore {
    // Store layout is private to MetricStore:
    // - outer key: runtime source scope id. Composed readings may use logical
    //   scopes such as "local"; background collection writes source or profile
    //   scopes such as "node-system" so read-time fallback can compare
    //   candidates without overwriting them.
    // - inner key: ShoMetrics metric id inside that source scope, for example "cpu.usage_percent" or "disk.throughput.read".
    // No separator or escaped string format is reserved here; adapters own validation before values reach this store.
    private store = new Map<string, SourceMetricStore>();
    private valueAttributionsBySourceScopeId = new Map<string, Map<string, MetricValueAttribution>>();
    private unavailableMetricsBySourceScopeId = new Map<string, Map<string, MetricUnavailableReport>>();

    // Count of scalar samples retained for history-style views. This is not a
    // time-to-live; the latest value and timestamp remain available for
    // low-frequency widgets until the action's freshness budget rejects them.
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
            const valueAttribution = widgetData.sampleTimestampMilliseconds === undefined
                ? undefined
                : this.readValueAttribution(sourceScopeId, metricKey);
            const unavailableMetric = this.readUnavailableMetric(sourceScopeId, metricKey);

            return {
                widgetData,
                selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                    ? undefined
                    : sourceScopeId,
                ...(valueAttribution === undefined ? {} : { valueAttribution }),
                ...(unavailableMetric === undefined ? {} : { unavailableMetric }),
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
        const snapshotTimestampMilliseconds = readRequiredMetricSnapshotTimestampMilliseconds(snapshot);
        const sourceStore = this.ensureSourceStore(sourceScopeId);
        const valueAttributionsByMetricKey = new Map(
            sourceMetadata.valueAttributions?.map(attribution => [attribution.metricId, attribution]) ?? [],
        );

        for (const [metricKey, value] of Object.entries(snapshot.metrics)) {
            if (value.value.case === "scalar") {
                // Renderer-facing history accepts only finite scalar values.
                // NaN and +/-Infinity keep the previous valid value available
                // instead of poisoning progress/history calculations.
                if (!Number.isFinite(value.value.value)) {
                    continue;
                }

                const valueAttribution = valueAttributionsByMetricKey.get(metricKey);
                this.recordValueAttribution(sourceScopeId, metricKey, valueAttribution);
                this.clearUnavailableMetric(sourceScopeId, metricKey);
                this.record(
                    sourceStore,
                    metricKey,
                    value.value.value,
                    snapshotTimestampMilliseconds,
                    valueAttribution === undefined
                        ? "fresh"
                        : valueAttribution.valueFreshness,
                );
                continue;
            }

            if (value.value.case === "text") {
                if (value.value.value.trim().length === 0) {
                    continue;
                }

                this.recordText(sourceStore, metricKey, value.value.value, snapshotTimestampMilliseconds);
                this.recordValueAttribution(sourceScopeId, metricKey, valueAttributionsByMetricKey.get(metricKey));
                this.clearUnavailableMetric(sourceScopeId, metricKey);
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

    /** Clears all metric history and text values. Intended for isolated tests and source resets. */
    clear(): void {
        this.store.clear();
        this.valueAttributionsBySourceScopeId.clear();
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

    private readValueAttribution(
        sourceScopeId: string,
        metricKey: string,
    ): MetricValueAttribution | undefined {
        return this.valueAttributionsBySourceScopeId.get(sourceScopeId)?.get(metricKey);
    }

    private readUnavailableMetric(
        sourceScopeId: string,
        metricKey: string,
    ): MetricUnavailableReport | undefined {
        return this.unavailableMetricsBySourceScopeId.get(sourceScopeId)?.get(metricKey);
    }

    private recordValueAttribution(
        sourceScopeId: string,
        metricKey: string,
        valueAttribution: MetricValueAttribution | undefined,
    ): void {
        let valueAttributionsByMetricKey = this.valueAttributionsBySourceScopeId.get(sourceScopeId);

        if (valueAttribution === undefined) {
            valueAttributionsByMetricKey?.delete(metricKey);
            return;
        }

        if (!valueAttributionsByMetricKey) {
            valueAttributionsByMetricKey = new Map<string, MetricValueAttribution>();
            this.valueAttributionsBySourceScopeId.set(sourceScopeId, valueAttributionsByMetricKey);
        }

        valueAttributionsByMetricKey.set(metricKey, valueAttribution);
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
            // Value attribution and unavailable reports are mutually exclusive
            // for the latest source report; keep the last value separately in
            // MetricStore so rendering can still use it during the freshness window.
            this.recordValueAttribution(sourceScopeId, unavailableMetric.metricId, undefined);
            unavailableMetricsByMetricKey.set(unavailableMetric.metricId, unavailableMetric);
        }
    }

    private clearUnavailableMetric(sourceScopeId: string, metricKey: string): void {
        this.unavailableMetricsBySourceScopeId.get(sourceScopeId)?.delete(metricKey);
    }
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

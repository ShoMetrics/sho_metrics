import { RingBuffer } from "./ring-buffer";
import type { WidgetData } from "../view-rendering/widget-data";
import { readRequiredMetricSnapshotTimestampMilliseconds, type MetricSnapshot } from "./sources/metric-source";
import type {
    MetricUnavailableReport,
    SourceMetricValueMetadata,
} from "./sources/source-client";

export type MetricStoreIngestRejectionReason = "nonFiniteScalar" | "emptyText";

/** A value MetricStore intentionally dropped instead of adding to render state. */
export interface MetricStoreIngestRejection {
    readonly metricKey: string;
    readonly reason: MetricStoreIngestRejectionReason;
}

/**
 * Summarizes one ingest without changing the store mutation contract.
 *
 * Callers use this only for diagnostics. A rejected value means MetricStore
 * kept the same behavior it already had: invalid scalars and empty text are
 * ignored, previous valid state is left intact, and no raw value is exposed to
 * logs.
 */
export interface MetricStoreIngestReport {
    readonly acceptedScalarCount: number;
    readonly acceptedTextCount: number;
    readonly rejectedCount: number;
    readonly rejections: readonly MetricStoreIngestRejection[];
}

/** Read-only view of metric history bound to one source scope. */
export interface MetricStoreReader {
    /** Builds renderer-facing widget data for one metric in the bound source scope. */
    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData;

    /**
     * Builds renderer-facing widget data and reports which source scope supplied it.
     *
     * Fallback readers use this to expose the selected source and source-owned
     * value metadata without reimplementing source selection outside the
     * fallback decision point.
     */
    getWidgetDataReadResult(
        metricKey: string,
        label: string,
        unit: string,
        maxValue?: number,
    ): MetricWidgetDataReadResult;

    /** Reads the latest text value for one metric in the bound source scope. */
    getTextValue(metricKey: string): string | undefined;
}

/** Renderer-facing metric data plus the source selection result for that read. */
export interface MetricWidgetDataReadResult {
    readonly widgetData: WidgetData;
    readonly selectedSourceId: string | undefined;
    readonly valueMetadata?: SourceMetricValueMetadata;
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
    private valueMetadataBySourceScopeId = new Map<string, Map<string, SourceMetricValueMetadata>>();
    private unavailableMetricsBySourceScopeId = new Map<string, Map<string, MetricUnavailableReport>>();

    // Count of scalar samples retained for history-style views. This is not a
    // time-to-live; the latest value and timestamp remain available for
    // low-frequency widgets until the action's freshness budget rejects them.
    private static readonly HISTORY_SIZE = 60;

    /** Creates a read-only metric view bound to one runtime source scope. */
    forScope(sourceScopeId: string): MetricStoreReader {
        const readWidgetDataResult = (
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
            const valueMetadata = widgetData.sampleTimestampMilliseconds === undefined
                ? undefined
                : this.readValueMetadata(sourceScopeId, metricKey);
            const unavailableMetric = this.readUnavailableMetric(sourceScopeId, metricKey);

            return {
                widgetData,
                selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                    ? undefined
                    : sourceScopeId,
                ...(valueMetadata === undefined ? {} : { valueMetadata }),
                ...(unavailableMetric === undefined ? {} : { unavailableMetric }),
            };
        };

        return {
            getWidgetData: (metricKey, label, unit, maxValue) => readWidgetDataResult(
                metricKey,
                label,
                unit,
                maxValue,
            ).widgetData,
            getWidgetDataReadResult: readWidgetDataResult,
            getTextValue: metricKey => this.readTextValue(sourceScopeId, metricKey),
        };
    }

    /**
     * Ingests a snapshot into the history owned by one runtime source scope.
     *
     * The returned report is observational only. It lets polling owners log
     * bounded summaries for dropped values without duplicating MetricStore's
     * validation rules in each source adapter.
     */
    ingest(
        sourceScopeId: string,
        snapshot: MetricSnapshot,
        sourceMetadata: {
            readonly valueMetadata?: readonly SourceMetricValueMetadata[];
            readonly unavailableMetrics?: readonly MetricUnavailableReport[];
        } = {},
    ): MetricStoreIngestReport {
        const snapshotTimestampMilliseconds = readRequiredMetricSnapshotTimestampMilliseconds(snapshot);
        const sourceStore = this.ensureSourceStore(sourceScopeId);
        const valueMetadataByMetricKey = new Map(
            sourceMetadata.valueMetadata?.map(metadata => [metadata.metricId, metadata]) ?? [],
        );
        const rejections: MetricStoreIngestRejection[] = [];
        let acceptedScalarCount = 0;
        let acceptedTextCount = 0;

        for (const [metricKey, value] of Object.entries(snapshot.metrics)) {
            if (value.value.case === "scalar") {
                // Renderer-facing history accepts only finite scalar values.
                // NaN and +/-Infinity keep the previous valid value available
                // instead of poisoning progress/history calculations.
                if (!Number.isFinite(value.value.value)) {
                    rejections.push({ metricKey, reason: "nonFiniteScalar" });
                    continue;
                }

                acceptedScalarCount += 1;
                const valueMetadata = valueMetadataByMetricKey.get(metricKey);
                this.recordValueMetadata(sourceScopeId, metricKey, valueMetadata);
                this.clearUnavailableMetric(sourceScopeId, metricKey);
                this.record(
                    sourceStore,
                    metricKey,
                    value.value.value,
                    snapshotTimestampMilliseconds,
                    valueMetadata === undefined
                        ? "fresh"
                        : valueMetadata.valueFreshness,
                );
                continue;
            }

            if (value.value.case === "text") {
                if (value.value.value.trim().length === 0) {
                    rejections.push({ metricKey, reason: "emptyText" });
                    continue;
                }

                acceptedTextCount += 1;
                this.recordText(sourceStore, metricKey, value.value.value, snapshotTimestampMilliseconds);
                this.recordValueMetadata(sourceScopeId, metricKey, valueMetadataByMetricKey.get(metricKey));
                this.clearUnavailableMetric(sourceScopeId, metricKey);
            }
        }

        if (sourceMetadata.unavailableMetrics) {
            this.recordUnavailableMetrics(sourceScopeId, sourceMetadata.unavailableMetrics);
        }

        return {
            acceptedScalarCount,
            acceptedTextCount,
            rejectedCount: rejections.length,
            rejections,
        };
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
        this.valueMetadataBySourceScopeId.clear();
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

    private readValueMetadata(
        sourceScopeId: string,
        metricKey: string,
    ): SourceMetricValueMetadata | undefined {
        return this.valueMetadataBySourceScopeId.get(sourceScopeId)?.get(metricKey);
    }

    private readUnavailableMetric(
        sourceScopeId: string,
        metricKey: string,
    ): MetricUnavailableReport | undefined {
        return this.unavailableMetricsBySourceScopeId.get(sourceScopeId)?.get(metricKey);
    }

    private recordValueMetadata(
        sourceScopeId: string,
        metricKey: string,
        valueMetadata: SourceMetricValueMetadata | undefined,
    ): void {
        let valueMetadataByMetricKey = this.valueMetadataBySourceScopeId.get(sourceScopeId);

        if (valueMetadata === undefined) {
            valueMetadataByMetricKey?.delete(metricKey);
            return;
        }

        if (!valueMetadataByMetricKey) {
            valueMetadataByMetricKey = new Map<string, SourceMetricValueMetadata>();
            this.valueMetadataBySourceScopeId.set(sourceScopeId, valueMetadataByMetricKey);
        }

        valueMetadataByMetricKey.set(metricKey, valueMetadata);
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
            // Value metadata and unavailable reports are mutually exclusive
            // for the latest source report; keep the last value separately in
            // MetricStore so rendering can still use it during the freshness window.
            this.recordValueMetadata(sourceScopeId, unavailableMetric.metricId, undefined);
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

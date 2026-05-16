import { create } from "@bufbuild/protobuf";
import {
    MetricSnapshotSchema,
    MetricValueSchema,
    type MetricSnapshot,
    type MetricValue,
} from "../../generated/shometrics/v1/snapshot_pb.js";

export type IMetricSnapshot = MetricSnapshot;
export type IMetricValue = MetricValue;

export function buildMetricSnapshot(options: {
    sourceId: string;
    timestampMilliseconds: number;
    metrics: Record<string, IMetricValue>;
}): IMetricSnapshot {
    return create(MetricSnapshotSchema, {
        sourceId: options.sourceId,
        timestampMs: BigInt(Math.trunc(options.timestampMilliseconds)),
        metrics: options.metrics,
    });
}

export function buildScalarMetricValue(
    value: number,
    options: {
        unit?: string;
        progress?: number;
    } = {},
): IMetricValue {
    return create(MetricValueSchema, {
        data: {
            case: "scalar",
            value,
        },
        unit: options.unit,
        progress: options.progress,
    });
}

export function buildTextMetricValue(value: string): IMetricValue {
    return create(MetricValueSchema, {
        data: {
            case: "text",
            value,
        },
    });
}

/**
 * Metric source interface.
 * All sources (built-in, local helpers, push API) implement this contract.
 * The Scheduler consumes this interface, never a concrete implementation.
 */
export interface IMetricSource {
    /** Human-readable identifier, e.g. "node-system", "windows-helper" */
    readonly sourceId: string;

    /** Fetch the latest metrics snapshot in the universal protobuf-defined format. */
    poll(): Promise<IMetricSnapshot>;

    /** Fetch a subset of metrics when the source can avoid unrelated slow reads. */
    pollMetrics?(metricKeys: readonly string[]): Promise<IMetricSnapshot>;

    /** Optional cleanup on shutdown. */
    dispose?(): void;
}

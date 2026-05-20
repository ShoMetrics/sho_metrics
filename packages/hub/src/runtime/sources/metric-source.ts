import { create } from "@bufbuild/protobuf";
import { timestampFromMs, timestampMs } from "@bufbuild/protobuf/wkt";
import {
    MetricIdKind,
    MetricSnapshotSchema,
    MetricUnit,
    MetricValueSchema,
    MetricValueKind,
    type MetricSnapshot,
    type MetricValue,
} from "../../generated/shometrics/v1/snapshot_pb.js";
import type { SourceMetricPollingGroupResolver } from "./source-polling-groups";

// Runtime source adapters import wire metric enums through this boundary module.
// Rendering and ordinary PI code should consume render-facing models instead.
export { MetricIdKind, MetricUnit, MetricValueKind };
export type { MetricSnapshot, MetricValue };

export function buildMetricSnapshot(options: {
    timestampMilliseconds: number;
    metrics: Record<string, MetricValue>;
}): MetricSnapshot {
    return create(MetricSnapshotSchema, {
        capturedAt: timestampFromMs(Math.trunc(options.timestampMilliseconds)),
        metrics: options.metrics,
    });
}

export function readMetricSnapshotTimestampMilliseconds(snapshot: MetricSnapshot): number | undefined {
    return snapshot.capturedAt ? timestampMs(snapshot.capturedAt) : undefined;
}

export function readRequiredMetricSnapshotTimestampMilliseconds(snapshot: MetricSnapshot): number {
    const timestampMilliseconds = readMetricSnapshotTimestampMilliseconds(snapshot);
    if (timestampMilliseconds === undefined) {
        throw new Error("Metric snapshot is missing captured_at.");
    }

    return timestampMilliseconds;
}

export function buildScalarMetricValue(
    value: number,
    options: {
        unit?: MetricUnit;
    } = {},
): MetricValue {
    return create(MetricValueSchema, {
        value: {
            case: "scalar",
            value,
        },
        unit: options.unit,
    });
}

export function buildTextMetricValue(value: string): MetricValue {
    return create(MetricValueSchema, {
        value: {
            case: "text",
            value,
        },
        unit: MetricUnit.UNSPECIFIED,
    });
}

/**
 * Metric source contract.
 * All sources (built-in, local helpers, push API) implement this contract.
 * Background collection consumes this contract, never a concrete implementation.
 */
export interface MetricSource extends SourceMetricPollingGroupResolver {
    /** Human-readable identifier, e.g. "node-system", "windows-helper" */
    readonly sourceId: string;

    /** Fetch the latest metrics snapshot in the universal protobuf-defined format. */
    poll(): Promise<MetricSnapshot>;

    /** Fetch a subset of metrics when the source can avoid unrelated slow reads. */
    pollMetrics?(metricKeys: readonly string[]): Promise<MetricSnapshot>;

    /** Optional cleanup on shutdown. */
    dispose?(): void;
}

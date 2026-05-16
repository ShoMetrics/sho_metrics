import type { IMetricSource, IMetricSnapshot } from "./source.interface";

/** Source-owned warning emitted while serving health, descriptor, or snapshot requests. */
export interface SourceWarning {
    /** Stable warning code owned by the source adapter boundary. */
    readonly code: string;

    /** Human-readable diagnostic text for logs and support. */
    readonly message: string;

    /** Metric id affected by the warning when the warning is metric-specific. */
    readonly metricId?: string;

    /** Source-owned sensor id affected by the warning when one is known. */
    readonly sourceSensorId?: string;
}

/** Runtime health metadata returned by a source client. */
export interface SourceHealth {
    /** Source id owned by the runtime source registry. */
    readonly sourceId: string;

    /** Source API compatibility version when the source uses a versioned protocol. */
    readonly protocolVersion?: string;

    /** Installed helper or agent version for diagnostics only. */
    readonly helperVersion?: string;

    /** Non-fatal health warnings reported by the source. */
    readonly warnings: readonly SourceWarning[];
}

/** Runtime descriptor for a metric exposed by a source. */
export interface MetricDescriptor {
    /** ShoMetrics canonical metric key consumed by actions and MetricStore. */
    readonly metricId: string;

    /** Opaque sensor id owned by the source adapter. */
    readonly sourceSensorId: string;

    /** Opaque hardware id owned by the source adapter. */
    readonly hardwareId: string;

    /** Human-readable hardware name from the source. */
    readonly hardwareName: string;

    /** Human-readable sensor name from the source. */
    readonly sensorName: string;

    /** Source sensor type, such as Load, Temperature, or Power. */
    readonly sensorType: string;

    /** Unit used by the metric value. */
    readonly unit: string;

    /** Whether the metric is discovered dynamically instead of a stable alias. */
    readonly isDynamic: boolean;
}

/** Runtime source adapter consumed by SourceRunner. */
export interface SourceClient {
    /** Source id owned by the runtime source registry. */
    readonly sourceId: string;

    /** Reads one snapshot containing the requested ShoMetrics metric keys. */
    readSnapshot(metricKeys: readonly string[]): Promise<IMetricSnapshot>;

    /** Lists descriptors for requested metric keys or for all known metrics. */
    listMetricDescriptors?(metricKeys: readonly string[]): Promise<readonly MetricDescriptor[]>;

    /** Reads source health without mutating action or settings state. */
    getHealth?(): Promise<SourceHealth>;

    /** Releases resources owned by this source client. */
    dispose?(): void;
}

/** Adapts the current metric source contract into the SourceRunner client contract. */
export function createMetricSourceClient(source: IMetricSource): SourceClient {
    return {
        sourceId: source.sourceId,
        readSnapshot: metricKeys => source.pollMetrics ? source.pollMetrics(metricKeys) : source.poll(),
        dispose: () => source.dispose?.(),
    };
}

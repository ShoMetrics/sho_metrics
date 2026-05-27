import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor as ProtoMetricDescriptor,
    type MetricUnavailableReport as ProtoMetricUnavailableReport,
    type MetricValueAttribution as ProtoMetricValueAttribution,
    type RawSensorIdentity as ProtoRawSensorIdentity,
} from "../../generated/shometrics/v1/source_api_pb.js";
import type {
    MetricSnapshot,
    MetricSource,
} from "./metric-source";
import type { SourceMetricPollingGroupResolver } from "./source-polling-groups";
import type { SourceMetadataInvalidationListener } from "./source-planning-metadata";

/** Source-owned warning emitted while serving health, descriptor, or snapshot requests. */
export interface SourceWarning {
    /** Stable warning code owned by the source adapter boundary. */
    readonly code: string;

    /** Human-readable support text for logs and DEBUG views. */
    readonly message: string;

    /** Metric id affected by the warning when the warning is metric-specific. */
    readonly metricId?: string;

    /** Source-owned sensor id affected by the warning when one is known. */
    readonly sourceSensorId?: string;
}

export { MetricIdKind, MetricValueKind };

// Source-runtime payloads intentionally derive from the source API proto so the
// wire shape and runtime facade cannot drift. Strip protobuf-es implementation
// fields here; adapters still own wire invariant and version-skew handling.
type RuntimeProtoPayload<T> = Readonly<{
    [Key in keyof T as Key extends `$${string}` ? never : Key]: T[Key];
}>;
type RuntimeProtoPayloadWithRequiredRawSensor<T> = Readonly<
    Omit<RuntimeProtoPayload<T>, "rawSensorIdentity">
    & { readonly rawSensorIdentity: RawSensorIdentity }
>;
type RuntimeProtoPayloadWithOptionalRawSensor<T> = Readonly<
    Omit<RuntimeProtoPayload<T>, "rawSensorIdentity">
    & { readonly rawSensorIdentity?: RawSensorIdentity }
>;

/** Source-owned raw sensor identity for descriptors and source attribution. */
export type RawSensorIdentity = RuntimeProtoPayload<ProtoRawSensorIdentity>;

/** Runtime freshness state after source adapter enum compatibility handling. */
export type MetricValueFreshness = "fresh" | "retained";

/** Runtime unavailable reason after source adapter enum compatibility handling. */
export type MetricUnavailableReason =
    | "noSensorData"
    | "invalidValue"
    | "expired"
    | "unknown";

/** Runtime health metadata returned by a source client. */
export interface SourceHealth {
    /** Source id owned by the runtime source registry. */
    readonly sourceId: string;

    /** Source API compatibility version when the source uses a versioned protocol. */
    readonly protocolVersion?: string;

    /** Installed helper or agent version for support and DEBUG views only. */
    readonly helperVersion?: string;

    /** Non-fatal health warnings reported by the source. */
    readonly warnings: readonly SourceWarning[];
}

/** Runtime source availability state owned by one source client. */
export type SourceClientStatusState = "unknown" | "available" | "unavailable" | "unsupported";

/** Source-client-owned reason for the latest non-available status. */
export type SourceClientStatusReason =
    | "pipeMissing"
    | "timeout"
    | "healthFailed"
    | "sourceError"
    | "protocolMismatch"
    | "helperNotInstalled"
    | "helperStopped"
    | "driverUnavailable";

/** Runtime-only source status for support and future Property Inspector DEBUG views. */
export interface SourceClientStatus {
    /** Current availability state known by this client. */
    readonly state: SourceClientStatusState;

    /** Last non-available reason when one is known. */
    readonly reason?: SourceClientStatusReason;

    /** Absolute Unix timestamp in milliseconds when this client may retry. */
    readonly retryAfterTimestampMilliseconds?: number;

    /** Stable source or OS error code for the last failure when one is known. */
    readonly lastErrorCode?: string;

    /** Human-readable last failure detail for the DEBUG view. */
    readonly lastErrorMessage?: string;

    /** Installed helper or agent version for the DEBUG view. */
    readonly helperVersion?: string;

    /** Source API compatibility version for the DEBUG view. */
    readonly protocolVersion?: string;

    /** Absolute Unix timestamp in milliseconds for the latest successful request. */
    readonly lastSuccessAtTimestampMilliseconds?: number;

    /** Absolute Unix timestamp in milliseconds for the latest failed request. */
    readonly lastFailureAtTimestampMilliseconds?: number;
}

/** Runtime descriptor for a metric exposed by a source. */
export type MetricDescriptor = RuntimeProtoPayloadWithRequiredRawSensor<ProtoMetricDescriptor>;

/** Source-owned descriptor snapshot read through the source client boundary. */
export interface MetricDescriptorSnapshot {
    /** Descriptors matching the requested metric keys, or all descriptors when the request is empty. */
    readonly descriptors: readonly MetricDescriptor[];

    /**
     * Source-owned identity for the complete descriptor catalog.
     *
     * This fingerprint must cover the complete planning descriptor set even
     * when `descriptors` is filtered to requested metric keys.
     */
    readonly descriptorFingerprint: string;
}

/** Runtime source snapshot plus source-owned per-metric metadata. */
export interface SourceSnapshotReadResult {
    readonly snapshot: MetricSnapshot;
    readonly valueAttributions: readonly MetricValueAttribution[];
    readonly unavailableMetrics: readonly MetricUnavailableReport[];
}

/** Source refresh demand for one source-owned polling group. */
export interface SourceRefreshDemandGroup {
    /** Source-owned descriptor polling group id. Hub must not parse it. */
    readonly pollingGroupId: string;

    /** ShoMetrics metric keys that caused this group to be demanded. */
    readonly metricKeys: readonly string[];

    /** Hub-requested cadence. Sources may clamp it to their own safe limits. */
    readonly intervalMilliseconds: number;
}

/** Source-owned refresh demand failure exposed to the collection supervisor. */
export class SourceRefreshDemandError extends Error {
    override readonly name = "SourceRefreshDemandError";

    constructor(
        readonly reason: "invalidDemand",
        message: string,
    ) {
        super(message);
    }
}

export function isInvalidSourceRefreshDemandError(error: unknown): boolean {
    return error instanceof SourceRefreshDemandError
        && error.reason === "invalidDemand";
}

/** Source-owned attribution for a metric value included in a snapshot. */
export type MetricValueAttribution = Readonly<
    Omit<RuntimeProtoPayloadWithOptionalRawSensor<ProtoMetricValueAttribution>, "valueFreshness">
    & { readonly valueFreshness: MetricValueFreshness }
>;

/** Source-reported reason for a requested metric omitted from a snapshot. */
export type MetricUnavailableReport = Readonly<
    Omit<RuntimeProtoPayloadWithOptionalRawSensor<ProtoMetricUnavailableReport>, "reason">
    & { readonly reason: MetricUnavailableReason }
>;

/** Runtime source adapter consumed by background metric collection. */
export interface SourceClient extends SourceMetricPollingGroupResolver {
    /** Source id owned by the runtime source registry. */
    readonly sourceId: string;

    /** Reads one snapshot containing the requested ShoMetrics metric keys. */
    readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult>;

    /** Lists descriptors for requested metric keys or for all known metrics. */
    listMetricDescriptors?(metricKeys: readonly string[]): Promise<MetricDescriptorSnapshot>;

    /**
     * Sends the complete active refresh demand for source-owned polling groups.
     *
     * Some sources keep snapshots in an async cache instead of collecting
     * hardware during `readSnapshot`. Demand tells those sources which polling
     * groups should stay warm and at what cadence while visible subscriptions
     * exist.
     */
    setMetricRefreshDemand?(groups: readonly SourceRefreshDemandGroup[]): Promise<void>;

    /** Checks source health by performing source-owned I/O. */
    checkHealth?(): Promise<SourceHealth>;

    /** Returns the latest cached client-owned runtime status without doing I/O. */
    getCachedStatus?(): SourceClientStatus;

    /**
     * Subscribes to complete source planning metadata changes.
     *
     * Source clients must call the listener only after descriptor, capability,
     * and planning-relevant profile metadata has reached a complete snapshot.
     * This hook must not report source health, connection recovery, partial
     * descriptor traversal, or reading freshness.
     */
    subscribeSourceMetadataInvalidations?(listener: SourceMetadataInvalidationListener): () => void;

    /** Releases resources owned by this source client. */
    dispose?(): void;
}

/** Adapts the current metric source contract into the source client contract. */
export function createMetricSourceClient(source: MetricSource): SourceClient {
    return {
        sourceId: source.sourceId,
        readSnapshot: async metricKeys => ({
            snapshot: source.pollMetrics
                ? await source.pollMetrics(metricKeys)
                : await source.poll(),
            valueAttributions: [],
            unavailableMetrics: [],
        }),
        resolveMetricPollingGroups: source.resolveMetricPollingGroups.bind(source),
        dispose: () => source.dispose?.(),
    };
}

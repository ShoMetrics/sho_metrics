import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { promisify } from "node:util";
import { logger } from "../../../logging/logger";
import {
    GetSourceHealthRequestSchema,
    ListMetricDescriptorsRequestSchema,
    ReadMetricSnapshotRequestSchema,
    type GetSourceHealthResponse,
    type MetricDescriptor as ProtoMetricDescriptor,
    MetricUnavailableReason as ProtoMetricUnavailableReason,
    type MetricUnavailableReport as ProtoMetricUnavailableReport,
    type MetricValueAttribution as ProtoMetricValueAttribution,
    MetricValueFreshness as ProtoMetricValueFreshness,
    type RawSensorIdentity as ProtoRawSensorIdentity,
    type SourceWarning as ProtoSourceWarning,
} from "../../../generated/shometrics/v1/source_api_pb.js";
import {
    SourceIpcRequestSchema,
    SourceIpcResponseSchema,
    type SourceIpcRequest,
    type SourceIpcResponse,
} from "../../../generated/shometrics/v1/source_ipc_pb.js";
import {
    readMetricSnapshotTimestampMilliseconds,
    type MetricSnapshot,
} from "../metric-source";
import {
    type MetricDescriptor,
    type MetricDescriptorSnapshot,
    type MetricUnavailableReason,
    type MetricUnavailableReport,
    type MetricValueFreshness,
    type MetricValueAttribution,
    type RawSensorIdentity,
    type SourceClient,
    type SourceClientStatus,
    type SourceClientStatusReason,
    type SourceHealth,
    type SourceSnapshotReadResult,
    type SourceWarning,
} from "../source-client";
import type {
    SourceMetadataInvalidation,
    SourceMetadataInvalidationListener,
    SourceMetadataInvalidationReason,
} from "../source-planning-metadata";
import {
    LOCAL_SOURCE_SCOPE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../source-ids";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";

const log = logger.for("Source:WindowsHelper");

/** Named pipe path used by the Windows helper service. */
export const DEFAULT_WINDOWS_HELPER_PIPE_PATH = "\\\\.\\pipe\\ShoMetrics.Source.Windows.v1";

/** Source API version supported by this Node adapter. */
export const SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION = "1";

/** Maximum protobuf payload size accepted by the local source IPC frame codec. */
export const MAXIMUM_SOURCE_IPC_FRAME_BYTES = 1024 * 1024;

/** Minimum cooldown before retrying helper health after protocol incompatibility. */
export const UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS = 60000;

/** Cooldown before retrying when the Windows helper named pipe is missing. */
export const PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS = 300000;

/** Fast pipe retry interval while helper-backed demand first appears or recovers. */
export const ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS = 2000;

/** Fast pipe retry window for active helper-backed demand. */
export const ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS = 60000;

/** Cache duration for Windows service status probes. */
export const HELPER_SERVICE_STATUS_CACHE_MILLISECONDS = 30000;

/** Retry cooldowns for transient helper failures, indexed by consecutive failure count. */
export const HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS = [5000, 15000, 60000] as const;

const SOURCE_IPC_LENGTH_PREFIX_BYTES = 4;
const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
const DEFAULT_HEALTH_TIMEOUT_MILLISECONDS = 750;
const DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS = 2000;
const DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS = 5000;
// Mirrors `ServiceName` in
// packages/source-windows/ShoMetrics.Source.Windows.Ipc/SourceIpcConstants.cs.
const WINDOWS_HELPER_SERVICE_NAME = "ShoMetrics Source Windows";
const execFileAsync = promisify(execFile);

/**
 * Startup retry interval for descriptor preload. This closes the common
 * Node-before-helper race without waiting for the steady retry interval.
 */
const DESCRIPTOR_PRELOAD_STARTUP_RETRY_MILLISECONDS = 2000;

/**
 * Startup window for fast descriptor preload retries. After this window, a
 * missing helper is no longer treated as a startup race and retries slow down.
 */
const DESCRIPTOR_PRELOAD_STARTUP_RETRY_WINDOW_MILLISECONDS = 60000;

/**
 * Steady descriptor preload retry interval after the startup window has passed.
 * This timer is metadata-only and runs only while descriptor listeners exist
 * and no descriptor snapshot has loaded yet.
 */
const DEFAULT_DESCRIPTOR_PRELOAD_RETRY_MILLISECONDS = 10000;

/**
 * Throttles repeated descriptor preload warnings to one supportable log per
 * minute while the helper is starting, missing, or temporarily unavailable.
 */
const DESCRIPTOR_PRELOAD_WARNING_INTERVAL_MILLISECONDS = 60000;
const WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS = 30000;

/** Timeout configuration for the Windows helper source client. */
export interface WindowsHelperSourceTimeouts {
    readonly healthMilliseconds: number;
    readonly readSnapshotMilliseconds: number;
    readonly listDescriptorsMilliseconds: number;
}

/** Timer handle used by descriptor preload retry scheduling. */
export interface WindowsHelperDescriptorPreloadTimerHandle {
    /** Allows retry timers to avoid keeping the plugin process alive. */
    unref?(): void;
}

/** Timer dependency for descriptor preload retry scheduling. */
export interface WindowsHelperDescriptorPreloadTimer {
    /** Schedules a retry after the configured delay. */
    set(callback: () => void, delayMilliseconds: number): WindowsHelperDescriptorPreloadTimerHandle;

    /** Clears a previously scheduled retry. */
    clear(handle: WindowsHelperDescriptorPreloadTimerHandle): void;
}

export type WindowsHelperServiceStatus = "unknown" | "notInstalled" | "installedStopped" | "running";

/** Reads packaged Windows service status without touching the metric pipe. */
export interface WindowsHelperServiceStatusReader {
    readStatus(): Promise<WindowsHelperServiceStatus>;
}

/** Options passed to a source IPC transport request. */
export interface WindowsHelperPipeTransportRequestOptions {
    readonly pipePath: string;
    readonly timeoutMilliseconds: number;
}

/** Byte transport used by the Windows helper source client. */
export interface WindowsHelperPipeTransport {
    /** Sends one protobuf payload and resolves with one protobuf response payload. */
    send(
        payload: Uint8Array,
        options: WindowsHelperPipeTransportRequestOptions,
    ): Promise<Uint8Array>;

    /** Releases transport-owned sockets or handles. */
    dispose?(): void;
}

/** Options for the Windows helper source client. */
export interface WindowsHelperSourceClientOptions {
    readonly pipePath?: string;
    readonly transport?: WindowsHelperPipeTransport;
    readonly requestIdFactory?: () => string;
    readonly now?: () => number;
    readonly timeouts?: Partial<WindowsHelperSourceTimeouts>;
    readonly descriptorPreloadRetryMilliseconds?: number;
    readonly descriptorPreloadTimer?: WindowsHelperDescriptorPreloadTimer;
    readonly serviceStatusReader?: WindowsHelperServiceStatusReader;
}

/** Encodes one source IPC protobuf payload using uint32 little-endian framing. */
export function encodeSourceIpcFrame(payload: Uint8Array): Uint8Array {
    validateSourceIpcPayloadLength(payload.byteLength);

    const frame = Buffer.allocUnsafe(SOURCE_IPC_LENGTH_PREFIX_BYTES + payload.byteLength);
    frame.writeUInt32LE(payload.byteLength, 0);
    frame.set(payload, SOURCE_IPC_LENGTH_PREFIX_BYTES);

    return frame;
}

/** Decodes one exact source IPC frame and returns the protobuf payload bytes. */
export function decodeSourceIpcFrame(frame: Uint8Array): Uint8Array {
    if (frame.byteLength < SOURCE_IPC_LENGTH_PREFIX_BYTES) {
        throw new Error("Source IPC frame is missing the length prefix.");
    }

    const payloadLength = readLittleEndianUint32(frame, 0);
    validateSourceIpcPayloadLength(payloadLength);

    const expectedFrameLength = SOURCE_IPC_LENGTH_PREFIX_BYTES + payloadLength;
    if (frame.byteLength !== expectedFrameLength) {
        throw new Error("Source IPC frame length does not match the payload length prefix.");
    }

    return frame.subarray(SOURCE_IPC_LENGTH_PREFIX_BYTES);
}

/** Sends source API requests to the installed Windows helper over a named pipe. */
export class WindowsHelperSourceClient implements SourceClient {
    readonly sourceId = WINDOWS_HELPER_SOURCE_ID;

    private readonly pipePath: string;
    private readonly transport: WindowsHelperPipeTransport;
    private readonly requestIdFactory: () => string;
    private readonly now: () => number;
    private readonly timeouts: WindowsHelperSourceTimeouts;
    private readonly descriptorPreloadRetryMilliseconds: number;
    private readonly descriptorPreloadTimer: WindowsHelperDescriptorPreloadTimer;
    private readonly serviceStatusReader: WindowsHelperServiceStatusReader;
    private protocolCompatibility: "unknown" | "supported" = "unknown";
    private protocolCheckPromise: Promise<void> | undefined;
    private unsupportedProtocolRetryAfterMilliseconds = 0;
    private helperUnavailableRetryAfterMilliseconds = 0;
    private helperUnavailableFailureCount = 0;
    private activeHelperDemandStartedAtTimestampMilliseconds: number | undefined;
    private serviceStatusProbePromise: Promise<void> | undefined;
    private serviceStatusCacheExpiresAtTimestampMilliseconds = 0;
    private cachedServiceStatus: WindowsHelperServiceStatus = "unknown";
    private status: SourceClientStatus = { state: "unknown" };
    private descriptorFingerprint: string | undefined;
    private hasCompleteDescriptorSnapshot = false;
    private descriptorPreloadStartedAtTimestampMilliseconds: number | undefined;
    private descriptorPreloadPromise: Promise<void> | undefined;
    private descriptorPreloadRetryTimer: WindowsHelperDescriptorPreloadTimerHandle | undefined;
    private readonly descriptorsByMetricId = new Map<string, MetricDescriptor>();
    private readonly sourceMetadataInvalidationListeners = new Set<SourceMetadataInvalidationListener>();

    constructor(options: WindowsHelperSourceClientOptions = {}) {
        this.pipePath = options.pipePath ?? DEFAULT_WINDOWS_HELPER_PIPE_PATH;
        this.transport = options.transport ?? new NodeWindowsHelperPipeTransport();
        this.requestIdFactory = options.requestIdFactory ?? randomUUID;
        this.now = options.now ?? Date.now;
        this.timeouts = {
            healthMilliseconds: options.timeouts?.healthMilliseconds
                ?? DEFAULT_HEALTH_TIMEOUT_MILLISECONDS,
            readSnapshotMilliseconds: options.timeouts?.readSnapshotMilliseconds
                ?? DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS,
            listDescriptorsMilliseconds: options.timeouts?.listDescriptorsMilliseconds
                ?? DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS,
        };
        this.descriptorPreloadRetryMilliseconds = options.descriptorPreloadRetryMilliseconds
            ?? DEFAULT_DESCRIPTOR_PRELOAD_RETRY_MILLISECONDS;
        this.descriptorPreloadTimer = options.descriptorPreloadTimer ?? nodeDescriptorPreloadTimer;
        this.serviceStatusReader = options.serviceStatusReader ?? windowsServiceStatusReader;
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        this.markHelperDemandActive();
        await this.ensureProtocolSupported();

        const requestStartedAtTimestampMilliseconds = this.now();
        let response: SourceIpcResponse;
        try {
            response = await this.sendSourceIpcRequest({
                case: "readMetricSnapshot",
                value: create(ReadMetricSnapshotRequestSchema, {
                    metricIds: [...metricKeys],
                    includeDescriptors: false,
                }),
            }, this.timeouts.readSnapshotMilliseconds);
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (response.payload.case !== "readMetricSnapshot") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        const readResponse = response.payload.value;
        const snapshot = readResponse.snapshot;
        if (!snapshot) {
            throw new Error("Windows source returned a snapshot response without a snapshot.");
        }

        const timestampMilliseconds = readMetricSnapshotTimestampMilliseconds(snapshot);
        if (timestampMilliseconds === undefined) {
            const error = new WindowsHelperSourceClientError(
                "Windows source returned a metric snapshot without captured_at.",
                "missing_captured_at",
                "sourceError",
            );
            this.recordHelperRequestFailure(error);
            throw error;
        }

        this.recordHelperRequestSuccess();
        this.logSnapshotRead(metricKeys, snapshot, requestStartedAtTimestampMilliseconds, timestampMilliseconds);
        const sourceMetadata = toRuntimeSnapshotMetadata({
            requestedMetricKeys: metricKeys,
            snapshot,
            valueAttributions: readResponse.valueAttributions,
            unavailableMetrics: readResponse.unavailableMetrics,
        });

        return {
            snapshot,
            valueAttributions: sourceMetadata.valueAttributions,
            unavailableMetrics: sourceMetadata.unavailableMetrics,
        };
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [metricKey, this.resolveMetricPollingGroup(metricKey)]));
    }

    async listMetricDescriptors(metricKeys: readonly string[]): Promise<MetricDescriptorSnapshot> {
        this.markHelperDemandActive();
        await this.ensureProtocolSupported();

        return await this.readMetricDescriptors(metricKeys);
    }

    subscribeSourceMetadataInvalidations(listener: SourceMetadataInvalidationListener): () => void {
        this.sourceMetadataInvalidationListeners.add(listener);
        this.markHelperDemandActive();

        if (this.hasCompleteDescriptorSnapshot && this.descriptorFingerprint !== undefined) {
            listener(this.buildSourceMetadataInvalidation("descriptorLoaded"));
        } else {
            this.startDescriptorPreload();
        }

        return () => {
            this.sourceMetadataInvalidationListeners.delete(listener);

            if (this.sourceMetadataInvalidationListeners.size === 0) {
                this.clearDescriptorPreloadRetry();
                this.descriptorPreloadStartedAtTimestampMilliseconds = undefined;
            }
        };
    }

    private async readMetricDescriptors(metricKeys: readonly string[]): Promise<MetricDescriptorSnapshot> {
        const isCompleteCatalogResponse = metricKeys.length === 0;
        let response: SourceIpcResponse;
        try {
            response = await this.sendSourceIpcRequest({
                case: "listMetricDescriptors",
                value: create(ListMetricDescriptorsRequestSchema, {
                    metricIds: [...metricKeys],
                }),
            }, this.timeouts.listDescriptorsMilliseconds);
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (response.payload.case !== "listMetricDescriptors") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        const descriptorSnapshot = response.payload.value.descriptorSnapshot;
        if (!descriptorSnapshot) {
            throw new Error("Windows source returned a descriptor response without a descriptor snapshot.");
        }

        this.recordHelperRequestSuccess();

        const runtimeDescriptorSnapshot = {
            descriptors: descriptorSnapshot.descriptors.flatMap(descriptor => {
                const runtimeDescriptor = toRuntimeMetricDescriptor(descriptor);
                return runtimeDescriptor ? [runtimeDescriptor] : [];
            }),
            descriptorFingerprint: descriptorSnapshot.descriptorFingerprint,
        };
        const invalidationReason = this.recordDescriptorSnapshot(
            runtimeDescriptorSnapshot,
            { isCompleteCatalogResponse },
        );
        if (invalidationReason) {
            this.publishSourceMetadataInvalidation(invalidationReason);
        }

        return runtimeDescriptorSnapshot;
    }

    async checkHealth(): Promise<SourceHealth> {
        let health: SourceHealth;
        try {
            health = await this.readSourceHealth();
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (health.protocolVersion === SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION) {
            this.protocolCompatibility = "supported";
            this.recordHelperRequestSuccess(health);
        } else {
            this.recordUnsupportedProtocol("unsupported_protocol");
        }

        return health;
    }

    private async readSourceHealth(): Promise<SourceHealth> {
        const response = await this.sendSourceIpcRequest({
            case: "getSourceHealth",
            value: create(GetSourceHealthRequestSchema),
        }, this.timeouts.healthMilliseconds);

        if (response.payload.case !== "getSourceHealth") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        return toRuntimeSourceHealth(response.payload.value);
    }

    private startDescriptorPreload(): void {
        if (this.descriptorPreloadPromise) {
            return;
        }

        this.descriptorPreloadStartedAtTimestampMilliseconds ??= this.now();
        this.clearDescriptorPreloadRetry();

        this.descriptorPreloadPromise = this.preloadDescriptorMetadata()
            .finally(() => {
                this.descriptorPreloadPromise = undefined;

                if (!this.hasCompleteDescriptorSnapshot && this.sourceMetadataInvalidationListeners.size > 0) {
                    this.scheduleDescriptorPreloadRetry();
                }
            });
    }

    private async preloadDescriptorMetadata(): Promise<void> {
        try {
            await this.readAndValidateHealth();
            await this.readMetricDescriptors([]);
        } catch (error) {
            const retryMilliseconds = this.selectDescriptorPreloadRetryMilliseconds();

            log.atWarn()
                .everyMs(
                    "descriptor-preload-failed",
                    DESCRIPTOR_PRELOAD_WARNING_INTERVAL_MILLISECONDS,
                )
                .log(() => [
                    "Descriptor preload failed",
                    `retryMs=${retryMilliseconds}`,
                    `error=${String(error)}`,
                ].join(" "));
        }
    }

    private scheduleDescriptorPreloadRetry(): void {
        if (this.descriptorPreloadRetryTimer) {
            return;
        }

        const retryMilliseconds = this.selectDescriptorPreloadRetryMilliseconds();

        this.descriptorPreloadRetryTimer = this.descriptorPreloadTimer.set(() => {
            this.descriptorPreloadRetryTimer = undefined;
            this.startDescriptorPreload();
        }, retryMilliseconds);
        this.descriptorPreloadRetryTimer.unref?.();
    }

    private selectDescriptorPreloadRetryMilliseconds(): number {
        const descriptorPreloadStartedAtTimestampMilliseconds = this.descriptorPreloadStartedAtTimestampMilliseconds;

        if (
            descriptorPreloadStartedAtTimestampMilliseconds !== undefined
            && (
                this.now() - descriptorPreloadStartedAtTimestampMilliseconds
            ) < DESCRIPTOR_PRELOAD_STARTUP_RETRY_WINDOW_MILLISECONDS
        ) {
            return DESCRIPTOR_PRELOAD_STARTUP_RETRY_MILLISECONDS;
        }

        return this.descriptorPreloadRetryMilliseconds;
    }

    private clearDescriptorPreloadRetry(): void {
        if (!this.descriptorPreloadRetryTimer) {
            return;
        }

        this.descriptorPreloadTimer.clear(this.descriptorPreloadRetryTimer);
        this.descriptorPreloadRetryTimer = undefined;
    }

    /**
     * Resolves helper metrics only from the cached descriptor catalog.
     *
     * A cache miss means the helper catalog is not ready for this metric. It is
     * not an unknown probe, because LHM/catalog sensor ids are source-owned and
     * should not fan out into isolated helper IPC calls before descriptors load.
     */
    private resolveMetricPollingGroup(metricKey: string): SourceMetricPollingGroupResolution {
        const descriptor = this.descriptorsByMetricId.get(metricKey);

        if (descriptor) {
            return {
                state: "owned",
                pollingGroupId: descriptor.pollingGroupId,
            };
        }

        if (this.hasCompleteDescriptorSnapshot) {
            return { state: "unsupported" };
        }

        // Descriptor-backed helper metrics must wait for metadata instead of
        // creating one isolated runner per unknown sensor id during cold start.
        return { state: "pendingMetadata" };
    }

    /**
     * Records descriptors returned by the helper while preserving catalog identity.
     *
     * Helper responses may be filtered to requested ids, but their fingerprint
     * names the complete catalog. Same-fingerprint responses accumulate;
     * changed-fingerprint responses clear old descriptors before adding the
     * filtered response.
     */
    private recordDescriptorSnapshot(
        descriptorSnapshot: MetricDescriptorSnapshot,
        options: {
            readonly isCompleteCatalogResponse: boolean;
        },
    ): SourceMetadataInvalidationReason | undefined {
        const previousDescriptorFingerprint = this.descriptorFingerprint;
        const hadCompleteDescriptorSnapshot = this.hasCompleteDescriptorSnapshot;
        const descriptorFingerprintChanged = this.descriptorFingerprint !== descriptorSnapshot.descriptorFingerprint;

        this.descriptorPreloadStartedAtTimestampMilliseconds = undefined;

        if (descriptorFingerprintChanged) {
            this.descriptorFingerprint = descriptorSnapshot.descriptorFingerprint;
            this.descriptorsByMetricId.clear();
            this.hasCompleteDescriptorSnapshot = false;
        }

        for (const descriptor of descriptorSnapshot.descriptors) {
            this.descriptorsByMetricId.set(descriptor.metricId, descriptor);
        }

        if (!options.isCompleteCatalogResponse) {
            // Production only reads complete catalogs today. If a future
            // filtered descriptor caller can receive a new fingerprint, it must
            // also publish descriptorChanged so active plans are reconciled.
            return undefined;
        }

        this.hasCompleteDescriptorSnapshot = true;

        if (!hadCompleteDescriptorSnapshot) {
            return "descriptorLoaded";
        }

        if (previousDescriptorFingerprint === descriptorSnapshot.descriptorFingerprint) {
            return undefined;
        }

        return previousDescriptorFingerprint === undefined
            ? "descriptorLoaded"
            : "descriptorChanged";
    }

    dispose(): void {
        this.clearDescriptorPreloadRetry();
        this.descriptorPreloadStartedAtTimestampMilliseconds = undefined;
        this.sourceMetadataInvalidationListeners.clear();
        this.transport.dispose?.();
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    private async ensureProtocolSupported(): Promise<void> {
        const nowMilliseconds = this.now();

        if (nowMilliseconds < this.unsupportedProtocolRetryAfterMilliseconds) {
            throw new Error("Windows source protocol is unsupported and still inside retry cooldown.");
        }

        if (nowMilliseconds < this.helperUnavailableRetryAfterMilliseconds) {
            throw new Error("Windows helper is unavailable and still inside retry cooldown.");
        }

        if (this.protocolCompatibility === "supported") {
            return;
        }

        this.protocolCheckPromise ??= this.readAndValidateHealth()
            .finally(() => {
                this.protocolCheckPromise = undefined;
            });

        await this.protocolCheckPromise;
    }

    private async readAndValidateHealth(): Promise<void> {
        const health = await this.checkHealth();

        if (health.protocolVersion !== SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION) {
            throw new Error([
                "Unsupported Windows source protocol.",
                `expected=${SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION}`,
                `actual=${health.protocolVersion ?? ""}`,
            ].join(" "));
        }
    }

    private async sendSourceIpcRequest(
        payload: SourceIpcRequest["payload"],
        timeoutMilliseconds: number,
    ): Promise<SourceIpcResponse> {
        const requestId = this.requestIdFactory();
        const requestStartedAtTimestampMilliseconds = this.now();
        const request = create(SourceIpcRequestSchema, {
            requestId,
            payload,
        });
        const requestBytes = toBinary(SourceIpcRequestSchema, request);
        const responseBytes = await this.transport.send(requestBytes, {
            pipePath: this.pipePath,
            timeoutMilliseconds,
        });
        const response = parseSourceIpcResponse(responseBytes);

        if (response.requestId !== requestId) {
            throw new Error("Windows source response request id mismatched the pending request.");
        }

        if (response.payload.case === "error") {
            if (response.payload.value.code === "unsupported_protocol") {
                this.recordUnsupportedProtocol(response.payload.value.code);
                throw new WindowsHelperSourceClientError([
                    "Windows source returned an error.",
                    `code=${response.payload.value.code}`,
                    `message=${response.payload.value.message}`,
                ].join(" "), response.payload.value.code, "protocolMismatch");
            }

            throw new WindowsHelperSourceClientError([
                "Windows source returned an error.",
                `code=${response.payload.value.code}`,
                `message=${response.payload.value.message}`,
            ].join(" "), response.payload.value.code, "sourceError");
        }

        if (response.payload.case === undefined) {
            throw new Error("Windows source returned an empty response payload.");
        }

        const requestCompletedAtTimestampMilliseconds = this.now();
        // TODO: Remove this temporary IPC timing log after the per-group
        // helper cache is implemented and measured.
        log.debug(() => [
            "sourceIpcRequestCompleted",
            `requestId=${requestId}`,
            `payloadCase=${payload.case ?? "empty"}`,
            `durationMs=${requestCompletedAtTimestampMilliseconds - requestStartedAtTimestampMilliseconds}`,
            `requestBytes=${requestBytes.byteLength}`,
            `responseBytes=${responseBytes.byteLength}`,
        ].join(" "));

        return response;
    }

    private recordUnsupportedProtocol(errorCode: string): void {
        const nowMilliseconds = this.now();
        this.protocolCompatibility = "unknown";
        this.unsupportedProtocolRetryAfterMilliseconds = nowMilliseconds
            + UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS;
        this.status = {
            state: "unsupported",
            reason: "protocolMismatch",
            retryAfterTimestampMilliseconds: this.unsupportedProtocolRetryAfterMilliseconds,
            lastErrorCode: errorCode,
            lastFailureAtTimestampMilliseconds: nowMilliseconds,
        };
    }

    private recordHelperRequestFailure(error: unknown): void {
        if (isUnsupportedProtocolError(error)) {
            return;
        }

        const nowMilliseconds = this.now();
        const failure = classifyHelperRequestFailure(error);
        const cooldownMilliseconds = failure.reason === "pipeMissing"
            ? this.selectPipeMissingRetryCooldownMilliseconds(nowMilliseconds)
            : this.nextUnavailableRetryCooldownMilliseconds();

        this.helperUnavailableRetryAfterMilliseconds = nowMilliseconds + cooldownMilliseconds;
        this.status = {
            state: "unavailable",
            reason: this.refinePipeMissingReason(failure.reason),
            retryAfterTimestampMilliseconds: this.helperUnavailableRetryAfterMilliseconds,
            ...(failure.errorCode ? { lastErrorCode: failure.errorCode } : {}),
            lastErrorMessage: toError(error).message,
            lastFailureAtTimestampMilliseconds: nowMilliseconds,
        };

        if (failure.reason === "pipeMissing") {
            this.refreshCachedServiceStatus();
        }
    }

    private recordHelperRequestSuccess(health?: SourceHealth): void {
        this.unsupportedProtocolRetryAfterMilliseconds = 0;
        this.helperUnavailableRetryAfterMilliseconds = 0;
        this.helperUnavailableFailureCount = 0;
        this.activeHelperDemandStartedAtTimestampMilliseconds = undefined;
        this.cachedServiceStatus = "running";
        this.serviceStatusCacheExpiresAtTimestampMilliseconds = this.now()
            + HELPER_SERVICE_STATUS_CACHE_MILLISECONDS;
        this.status = {
            state: "available",
            protocolVersion: health?.protocolVersion ?? this.status.protocolVersion ?? SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
            ...(health?.helperVersion ? { helperVersion: health.helperVersion } : {}),
            lastSuccessAtTimestampMilliseconds: this.now(),
        };
    }

    private markHelperDemandActive(): void {
        if (this.activeHelperDemandStartedAtTimestampMilliseconds !== undefined) {
            return;
        }

        this.activeHelperDemandStartedAtTimestampMilliseconds = this.now();
        this.refreshCachedServiceStatus();
    }

    private selectPipeMissingRetryCooldownMilliseconds(nowMilliseconds: number): number {
        const activeWindowStartedAt = this.activeHelperDemandStartedAtTimestampMilliseconds;

        if (
            activeWindowStartedAt !== undefined
            && nowMilliseconds - activeWindowStartedAt < ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS
        ) {
            return ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS;
        }

        return PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS;
    }

    private refinePipeMissingReason(reason: SourceClientStatusReason): SourceClientStatusReason {
        if (reason !== "pipeMissing") {
            return reason;
        }

        if (this.cachedServiceStatus === "notInstalled") {
            return "helperNotInstalled";
        }

        if (this.cachedServiceStatus === "installedStopped") {
            return "helperStopped";
        }

        return "pipeMissing";
    }

    private refreshCachedServiceStatus(): void {
        const nowMilliseconds = this.now();

        if (nowMilliseconds < this.serviceStatusCacheExpiresAtTimestampMilliseconds
            || this.serviceStatusProbePromise) {
            return;
        }

        this.serviceStatusProbePromise = this.serviceStatusReader.readStatus()
            .then(status => {
                this.cachedServiceStatus = status;
                this.serviceStatusCacheExpiresAtTimestampMilliseconds =
                    this.now() + HELPER_SERVICE_STATUS_CACHE_MILLISECONDS;

                if (this.status.state === "unavailable") {
                    this.status = {
                        ...this.status,
                        reason: this.refinePipeMissingReason(this.status.reason ?? "pipeMissing"),
                    };
                }
            })
            .catch(error => {
                log.atDebug()
                    .everyMs("service-status-probe-failed", HELPER_SERVICE_STATUS_CACHE_MILLISECONDS)
                    .log(() => `Windows helper service status probe failed: ${String(error)}`);
            })
            .finally(() => {
                this.serviceStatusProbePromise = undefined;
            });
    }

    private nextUnavailableRetryCooldownMilliseconds(): number {
        this.helperUnavailableFailureCount += 1;

        return selectHelperUnavailableRetryCooldownMilliseconds(this.helperUnavailableFailureCount);
    }

    private publishSourceMetadataInvalidation(reason: SourceMetadataInvalidationReason): void {
        if (this.sourceMetadataInvalidationListeners.size === 0) {
            return;
        }

        const invalidation = this.buildSourceMetadataInvalidation(reason);

        for (const listener of this.sourceMetadataInvalidationListeners) {
            listener(invalidation);
        }
    }

    private buildSourceMetadataInvalidation(
        reason: SourceMetadataInvalidationReason,
    ): SourceMetadataInvalidation {
        return {
            sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
            sourceProfileId: this.sourceId,
            planningFingerprint: buildWindowsHelperPlanningFingerprint(this.descriptorFingerprint ?? ""),
            reason,
        };
    }

    private logSnapshotRead(
        metricKeys: readonly string[],
        snapshot: MetricSnapshot,
        requestStartedAtTimestampMilliseconds: number,
        sampleTimestampMilliseconds: number,
    ): void {
        const completedAtTimestampMilliseconds = this.now();

        // TODO: Remove this temporary helper snapshot latency log after the
        // per-group helper cache is implemented and measured.
        log.debug(() => [
            "helperSnapshotRead",
            `metricCount=${metricKeys.length}`,
            `metricKeys=${metricKeys.join(",")}`,
            `durationMs=${completedAtTimestampMilliseconds - requestStartedAtTimestampMilliseconds}`,
            `sampleAgeMs=${completedAtTimestampMilliseconds - sampleTimestampMilliseconds}`,
            `snapshotMetricCount=${Object.keys(snapshot.metrics).length}`,
            `cpuUsagePercent=${readScalarMetricValue(snapshot, CPU_USAGE_METRIC_KEY) ?? ""}`,
        ].join(" "));
    }
}

function buildWindowsHelperPlanningFingerprint(descriptorFingerprint: string): string {
    return `windows-helper-descriptor:${descriptorFingerprint}`;
}

function readScalarMetricValue(snapshot: MetricSnapshot, metricKey: string): number | undefined {
    const metricValue = snapshot.metrics[metricKey];

    return metricValue?.value.case === "scalar" ? metricValue.value.value : undefined;
}

const nodeDescriptorPreloadTimer: WindowsHelperDescriptorPreloadTimer = {
    set: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clear: handle => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
};

const windowsServiceStatusReader: WindowsHelperServiceStatusReader = {
    async readStatus(): Promise<WindowsHelperServiceStatus> {
        try {
            const { stdout } = await execFileAsync(
                "sc.exe",
                ["query", WINDOWS_HELPER_SERVICE_NAME],
                { windowsHide: true },
            );
            const output = stdout.toLowerCase();

            if (output.includes("running")) {
                return "running";
            }

            if (output.includes("stopped")
                || output.includes("stop_pending")
                || output.includes("start_pending")) {
                return "installedStopped";
            }

            logUnknownServiceStatus("unrecognizedOutput");
            return "unknown";
        } catch (error) {
            const message = toError(error).message.toLowerCase();
            if (message.includes("1060") || message.includes("does not exist")) {
                return "notInstalled";
            }

            logUnknownServiceStatus("queryFailed");
            return "unknown";
        }
    },
};

function logUnknownServiceStatus(reason: "queryFailed" | "unrecognizedOutput"): void {
    log.atWarn()
        .everyMs(
            `service-status-unknown:${reason}`,
            HELPER_SERVICE_STATUS_CACHE_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperServiceStatusUnknown",
            `reason=${reason}`,
        ].join(" "));
}

function selectHelperUnavailableRetryCooldownMilliseconds(failureCount: number): number {
    const maximumBackoffMilliseconds = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[2];
    const backoffIndex = Math.min(
        Math.max(0, failureCount - 1),
        HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS.length - 1,
    );

    return HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[backoffIndex] ?? maximumBackoffMilliseconds;
}

class NodeWindowsHelperPipeTransport implements WindowsHelperPipeTransport {
    private readonly activeSockets = new Set<Socket>();

    async send(
        payload: Uint8Array,
        options: WindowsHelperPipeTransportRequestOptions,
    ): Promise<Uint8Array> {
        const requestFrame = encodeSourceIpcFrame(payload);
        const requestStartedAtTimestampMilliseconds = Date.now();

        return await new Promise<Uint8Array>((resolve, reject) => {
            const socket = createConnection(options.pipePath);
            const frameAccumulator = new SourceIpcFrameAccumulator();
            let isSettled = false;
            let connectedAtTimestampMilliseconds: number | undefined;
            let writeCompletedAtTimestampMilliseconds: number | undefined;
            let firstDataAtTimestampMilliseconds: number | undefined;
            const timeout = setTimeout(() => {
                fail(new Error("Windows source pipe request timed out."));
            }, options.timeoutMilliseconds);

            this.activeSockets.add(socket);

            const cleanup = (): void => {
                clearTimeout(timeout);
                socket.removeAllListeners();
                this.activeSockets.delete(socket);
                socket.destroy();
            };

            const fail = (error: Error): void => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                // TODO: Remove this temporary pipe timing log after the
                // per-group helper cache is implemented and measured.
                log.debug(() => [
                    "sourcePipeRequestFailed",
                    `durationMs=${Date.now() - requestStartedAtTimestampMilliseconds}`,
                    `connectMs=${formatOptionalDuration(
                        connectedAtTimestampMilliseconds,
                        requestStartedAtTimestampMilliseconds,
                    )}`,
                    `writeCompleteMs=${formatOptionalDuration(
                        writeCompletedAtTimestampMilliseconds,
                        requestStartedAtTimestampMilliseconds,
                    )}`,
                    `firstDataMs=${formatOptionalDuration(
                        firstDataAtTimestampMilliseconds,
                        requestStartedAtTimestampMilliseconds,
                    )}`,
                    `requestBytes=${requestFrame.byteLength}`,
                    `timeoutMs=${options.timeoutMilliseconds}`,
                    `error=${error.message}`,
                ].join(" "));
                cleanup();
                reject(error);
            };

            socket.once("connect", () => {
                connectedAtTimestampMilliseconds = Date.now();
                socket.write(requestFrame, error => {
                    if (error) {
                        fail(error);
                        return;
                    }

                    writeCompletedAtTimestampMilliseconds = Date.now();
                });
            });
            socket.on("data", chunk => {
                firstDataAtTimestampMilliseconds ??= Date.now();
                try {
                    const responsePayload = frameAccumulator.push(chunk);
                    if (!responsePayload) {
                        return;
                    }

                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    // TODO: Remove this temporary pipe timing log after the
                    // per-group helper cache is implemented and measured.
                    log.debug(() => [
                        "sourcePipeRequestCompleted",
                        `durationMs=${Date.now() - requestStartedAtTimestampMilliseconds}`,
                        `connectMs=${formatOptionalDuration(
                            connectedAtTimestampMilliseconds,
                            requestStartedAtTimestampMilliseconds,
                        )}`,
                        `writeCompleteMs=${formatOptionalDuration(
                            writeCompletedAtTimestampMilliseconds,
                            requestStartedAtTimestampMilliseconds,
                        )}`,
                        `firstDataMs=${formatOptionalDuration(
                            firstDataAtTimestampMilliseconds,
                            requestStartedAtTimestampMilliseconds,
                        )}`,
                        `requestBytes=${requestFrame.byteLength}`,
                        `responseBytes=${responsePayload.byteLength}`,
                        `timeoutMs=${options.timeoutMilliseconds}`,
                    ].join(" "));
                    cleanup();
                    resolve(responsePayload);
                } catch (error) {
                    fail(toError(error));
                }
            });
            socket.once("error", fail);
            socket.once("end", () => {
                fail(new Error("Windows source pipe ended before a response frame was read."));
            });
        });
    }

    dispose(): void {
        for (const socket of this.activeSockets) {
            socket.destroy();
        }

        this.activeSockets.clear();
    }
}

function formatOptionalDuration(
    timestampMilliseconds: number | undefined,
    startTimestampMilliseconds: number,
): string {
    return timestampMilliseconds === undefined
        ? ""
        : String(timestampMilliseconds - startTimestampMilliseconds);
}

class SourceIpcFrameAccumulator {
    private readonly chunks: Buffer[] = [];
    private receivedByteCount = 0;
    private expectedFrameLength: number | undefined;

    push(chunk: Buffer): Uint8Array | undefined {
        this.chunks.push(chunk);
        this.receivedByteCount += chunk.byteLength;

        if (this.expectedFrameLength === undefined
            && this.receivedByteCount >= SOURCE_IPC_LENGTH_PREFIX_BYTES) {
            const receivedBytes = Buffer.concat(this.chunks, this.receivedByteCount);
            const payloadLength = readLittleEndianUint32(receivedBytes, 0);
            validateSourceIpcPayloadLength(payloadLength);
            this.expectedFrameLength = SOURCE_IPC_LENGTH_PREFIX_BYTES + payloadLength;
        }

        if (this.expectedFrameLength === undefined
            || this.receivedByteCount < this.expectedFrameLength) {
            return undefined;
        }

        const frame = Buffer.concat(this.chunks, this.receivedByteCount);
        if (frame.byteLength !== this.expectedFrameLength) {
            throw new Error("Windows source pipe returned trailing bytes after one response frame.");
        }

        return decodeSourceIpcFrame(frame);
    }
}

function parseSourceIpcResponse(bytes: Uint8Array): SourceIpcResponse {
    try {
        return fromBinary(SourceIpcResponseSchema, bytes);
    } catch (error) {
        throw new Error(`Malformed Windows source IPC response: ${toError(error).message}`);
    }
}

function validateSourceIpcPayloadLength(payloadLength: number): void {
    if (payloadLength === 0) {
        throw new Error("Source IPC frame payload length must be greater than zero.");
    }

    if (payloadLength > MAXIMUM_SOURCE_IPC_FRAME_BYTES) {
        throw new Error("Source IPC frame payload length exceeds the maximum.");
    }
}

function readLittleEndianUint32(bytes: Uint8Array, offset: number): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(offset, true);
}

function toRuntimeSourceHealth(response: GetSourceHealthResponse): SourceHealth {
    return {
        sourceId: response.sourceId,
        protocolVersion: response.protocolVersion,
        helperVersion: response.helperVersion,
        warnings: response.warnings.map(toRuntimeSourceWarning),
    };
}

function toRuntimeSnapshotMetadata(options: {
    readonly requestedMetricKeys: readonly string[];
    readonly snapshot: MetricSnapshot;
    readonly valueAttributions: readonly ProtoMetricValueAttribution[];
    readonly unavailableMetrics: readonly ProtoMetricUnavailableReport[];
}): {
    readonly valueAttributions: readonly MetricValueAttribution[];
    readonly unavailableMetrics: readonly MetricUnavailableReport[];
} {
    const emittedMetricIds = new Set(Object.keys(options.snapshot.metrics));
    const requestedMetricIds = new Set(options.requestedMetricKeys);
    const validateRequestedMetricIds = requestedMetricIds.size > 0;
    const seenValueAttributionMetricIds = new Set<string>();
    const seenUnavailableMetricIds = new Set<string>();
    const valueAttributions: MetricValueAttribution[] = [];
    const unavailableMetrics: MetricUnavailableReport[] = [];

    for (const attribution of options.valueAttributions) {
        if (!emittedMetricIds.has(attribution.metricId)) {
            logDroppedWireRecord("valueAttribution", attribution.metricId, "orphan");
            continue;
        }

        if (seenValueAttributionMetricIds.has(attribution.metricId)) {
            logDroppedWireRecord("valueAttribution", attribution.metricId, "duplicate");
            continue;
        }

        seenValueAttributionMetricIds.add(attribution.metricId);
        valueAttributions.push(toRuntimeMetricValueAttribution(attribution));
    }

    for (const unavailableReport of options.unavailableMetrics) {
        if (validateRequestedMetricIds && !requestedMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "notRequested");
            continue;
        }

        if (emittedMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "emitted");
            continue;
        }

        if (seenUnavailableMetricIds.has(unavailableReport.metricId)) {
            logDroppedWireRecord("unavailableMetric", unavailableReport.metricId, "duplicate");
            continue;
        }

        seenUnavailableMetricIds.add(unavailableReport.metricId);
        unavailableMetrics.push(toRuntimeMetricUnavailableReport(unavailableReport));
    }

    return {
        valueAttributions,
        unavailableMetrics,
    };
}

function logDroppedWireRecord(
    recordKind: "valueAttribution" | "unavailableMetric",
    metricId: string,
    reason: "orphan" | "duplicate" | "notRequested" | "emitted",
): void {
    log.atWarn()
        .everyMs(
            `wireInvariantDropped:${recordKind}:${reason}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperWireRecordDropped",
            `recordKind=${recordKind}`,
            `reason=${reason}`,
            `metricId=${metricId}`,
        ].join(" "));
}

function logUnknownWireEnum(
    fieldName: string,
    metricId: string,
    value: number,
    fallback: string,
): void {
    log.atWarn()
        .everyMs(
            `wireEnumFallback:${fieldName}:${value}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperWireEnumFallback",
            `fieldName=${fieldName}`,
            `metricId=${metricId}`,
            `value=${value}`,
            `fallback=${fallback}`,
        ].join(" "));
}

function logDroppedDescriptor(metricId: string, reason: string): void {
    log.atWarn()
        .everyMs(
            `descriptorDropped:${reason}:${metricId}`,
            WIRE_INVARIANT_WARNING_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "windowsHelperDescriptorDropped",
            `reason=${reason}`,
            `metricId=${metricId}`,
        ].join(" "));
}

function toRuntimeMetricDescriptor(descriptor: ProtoMetricDescriptor): MetricDescriptor | undefined {
    const rawSensorIdentity = readRequiredRawSensorIdentity(descriptor.rawSensorIdentity, descriptor.metricId);
    const pollingGroupId = readRequiredDescriptorString({
        fieldName: "polling_group_id",
        fieldValue: descriptor.pollingGroupId,
        metricId: descriptor.metricId,
    });

    if (!rawSensorIdentity || !pollingGroupId) {
        // Helper/plugin versions may be skewed. A malformed descriptor should
        // not make the whole helper source unavailable; drop the bad record and
        // keep the support log from the field reader.
        return undefined;
    }

    return {
        metricId: descriptor.metricId,
        rawSensorIdentity,
        valueKind: descriptor.valueKind,
        unit: descriptor.unit,
        metricIdKind: descriptor.metricIdKind,
        pollingGroupId,
    };
}

function toRuntimeMetricValueAttribution(
    attribution: ProtoMetricValueAttribution,
): MetricValueAttribution {
    return {
        metricId: attribution.metricId,
        ...(attribution.rawSensorIdentity
            ? { rawSensorIdentity: toRuntimeRawSensorIdentity(attribution.rawSensorIdentity) }
            : {}),
        valueFreshness: normalizeMetricValueFreshness(attribution.valueFreshness, attribution.metricId),
        ...(attribution.retainedAgeMilliseconds === undefined
            ? {}
            : { retainedAgeMilliseconds: attribution.retainedAgeMilliseconds }),
    };
}

function toRuntimeMetricUnavailableReport(
    unavailableReport: ProtoMetricUnavailableReport,
): MetricUnavailableReport {
    return {
        metricId: unavailableReport.metricId,
        reason: normalizeMetricUnavailableReason(unavailableReport.reason, unavailableReport.metricId),
        ...(unavailableReport.rawSensorIdentity
            ? { rawSensorIdentity: toRuntimeRawSensorIdentity(unavailableReport.rawSensorIdentity) }
            : {}),
    };
}

function normalizeMetricValueFreshness(
    freshness: ProtoMetricValueFreshness,
    metricId: string,
): MetricValueFreshness {
    switch (freshness) {
        case ProtoMetricValueFreshness.FRESH:
            return "fresh";
        case ProtoMetricValueFreshness.RETAINED:
            return "retained";
        case ProtoMetricValueFreshness.UNSPECIFIED:
            logUnknownWireEnum("valueFreshness", metricId, freshness, "retained");
            return "retained";
    }

    logUnknownWireEnum("valueFreshness", metricId, freshness, "retained");
    return "retained";
}

function normalizeMetricUnavailableReason(
    reason: ProtoMetricUnavailableReason,
    metricId: string,
): MetricUnavailableReason {
    switch (reason) {
        case ProtoMetricUnavailableReason.NO_SENSOR:
            return "noSensorData";
        case ProtoMetricUnavailableReason.INVALID_VALUE:
            return "invalidValue";
        case ProtoMetricUnavailableReason.EXPIRED:
            return "expired";
        case ProtoMetricUnavailableReason.UNSPECIFIED:
            logUnknownWireEnum("unavailableReason", metricId, reason, "debugOnly");
            return "unknown";
    }

    logUnknownWireEnum("unavailableReason", metricId, reason, "debugOnly");
    return "unknown";
}

function readRequiredRawSensorIdentity(
    rawSensorIdentity: ProtoRawSensorIdentity | undefined,
    metricId: string,
): RawSensorIdentity | undefined {
    if (!rawSensorIdentity) {
        logDroppedDescriptor(metricId, "missingRawSensorIdentity");
        return undefined;
    }

    return toRuntimeRawSensorIdentity(rawSensorIdentity);
}

function toRuntimeRawSensorIdentity(rawSensorIdentity: ProtoRawSensorIdentity): RawSensorIdentity {
    return {
        sourceSensorId: rawSensorIdentity.sourceSensorId,
        hardwareId: rawSensorIdentity.hardwareId,
        hardwareName: rawSensorIdentity.hardwareName,
        hardwareType: rawSensorIdentity.hardwareType,
        sensorName: rawSensorIdentity.sensorName,
        sourceSensorType: rawSensorIdentity.sourceSensorType,
    };
}

function readRequiredDescriptorString(options: {
    readonly fieldName: string;
    readonly fieldValue: string;
    readonly metricId: string;
}): string | undefined {
    const value = options.fieldValue.trim();

    if (value.length === 0) {
        logDroppedDescriptor(options.metricId, `missing_${options.fieldName}`);
        return undefined;
    }

    return value;
}

function toRuntimeSourceWarning(warning: ProtoSourceWarning): SourceWarning {
    return {
        code: warning.code,
        message: warning.message,
        ...(warning.metricId ? { metricId: warning.metricId } : {}),
        ...(warning.sourceSensorId ? { sourceSensorId: warning.sourceSensorId } : {}),
    };
}

class WindowsHelperSourceClientError extends Error {
    override readonly name = "WindowsHelperSourceClientError";

    constructor(
        message: string,
        readonly code: string,
        readonly reason: SourceClientStatusReason,
    ) {
        super(message);
    }
}

function isUnsupportedProtocolError(error: unknown): boolean {
    return error instanceof WindowsHelperSourceClientError
        && error.reason === "protocolMismatch";
}

function classifyHelperRequestFailure(error: unknown): {
    readonly reason: SourceClientStatusReason;
    readonly errorCode?: string;
} {
    if (error instanceof WindowsHelperSourceClientError) {
        return {
            reason: error.reason,
            errorCode: error.code,
        };
    }

    const errorCode = readErrorCode(error);
    if (errorCode === "ENOENT") {
        return {
            reason: "pipeMissing",
            errorCode,
        };
    }

    if (errorCode === "ETIMEDOUT" || toError(error).message.toLowerCase().includes("timed out")) {
        return {
            reason: "timeout",
            ...(errorCode ? { errorCode } : {}),
        };
    }

    return {
        reason: "healthFailed",
        ...(errorCode ? { errorCode } : {}),
    };
}

function readErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return undefined;
    }

    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

import { create } from "@bufbuild/protobuf";
import { logger } from "../../../logging/node-logger";
import { resolveProductionLogThrottleMilliseconds } from "../../../logging/log-throttle";
import {
    monotonicNowMilliseconds,
    wallClockNowMilliseconds,
} from "../../../shared/clock";
import {
    GetSourceHealthRequestSchema,
    ListMetricDescriptorsRequestSchema,
    ReadMetricSnapshotRequestSchema,
    SetMetricRefreshDemandRequestSchema,
    type ListMetricDescriptorsResponse,
    type ReadMetricSnapshotResponse,
} from "../../../generated/proto/shometrics/v1/helper_grpc_service_pb.js";
import {
    readMetricSnapshotTimestampMilliseconds,
    type MetricSnapshot,
} from "../metric-source";
import {
    SourceRefreshDemandError,
    type MetricDescriptor,
    type MetricDescriptorSnapshot,
    type SourceClient,
    type SourceClientStatus,
    type SourceClientStatusReason,
    type SourceRefreshDemandGroup,
    type SourceHealth,
    type SourceSnapshotReadResult,
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
import {
    DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME,
    NodeWindowsHelperGrpcTransport,
    buildWindowsNamedPipeGrpcTarget,
    type WindowsHelperGrpcTransport,
} from "./windows-helper-grpc-transport";
import {
    WindowsHelperSourceClientError,
    classifyHelperRequestFailure,
    isInvalidRefreshDemandRequestError,
    isRefreshDemandControlPlaneError,
    isRefreshDemandUnsupportedError,
    isUnsupportedProtocolError,
    normalizeGrpcRequestError,
    shouldResetGrpcChannelAfterError,
    shouldResetRefreshDemandChannelAfterError,
    toError,
    toWindowsHelperSourceClientError,
} from "./windows-helper-grpc-errors";
import {
    toRuntimeMetricDescriptor,
    toRuntimeSnapshotMetadata,
    toRuntimeSourceHealth,
} from "./windows-helper-source-api-mapper";
import {
    HELPER_SERVICE_STATUS_CACHE_MILLISECONDS,
    windowsServiceStatusReader,
    type WindowsHelperServiceStatus,
    type WindowsHelperServiceStatusReader,
} from "./windows-helper-service-status";

const log = logger.for("Source:WindowsHelper");

/** Source API version supported by this Node adapter. */
export const SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION = "1";

/** Minimum cooldown before retrying helper health after protocol incompatibility. */
export const UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS = 60000;

/** Cooldown before retrying when the Windows helper named pipe is missing. */
export const PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS = 300000;

/** Fast pipe retry interval while helper-backed demand first appears or recovers. */
export const ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS = 2000;

/** Fast pipe retry window for active helper-backed demand. */
export const ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS = 60000;

/** Retry cooldowns for transient helper failures, indexed by consecutive failure count. */
export const HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS = [5000, 15000, 60000] as const;

/** Window after process resume where transient helper failures stay on the first retry rung. */
export const HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS = 90000;

/**
 * Helper-side TTL for active metric refresh demand.
 *
 * Keep this in sync with `MetricRefreshDemandConstants.DemandTtl` in the
 * Windows helper until the client derives the cap from the helper-advertised
 * `demandTtlMilliseconds` response field.
 */
export const HELPER_REFRESH_DEMAND_TTL_MILLISECONDS = 15000;

/** Longest transient unavailable cooldown allowed while active demand needs renewal. */
export const ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS = 10000;

const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
const DEFAULT_HEALTH_TIMEOUT_MILLISECONDS = 750;
const DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS = 2000;
const DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS = 5000;
const DEFAULT_SET_REFRESH_DEMAND_TIMEOUT_MILLISECONDS = 1000;
const HELPER_SNAPSHOT_FULL_KEY_LOG_LIMIT = 16;
const HELPER_SNAPSHOT_READ_LOG_INTERVAL_MILLISECONDS = resolveProductionLogThrottleMilliseconds(60000);
const HELPER_SNAPSHOT_STALE_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 5000;
const HELPER_SNAPSHOT_STALE_DIAGNOSTIC_THRESHOLD_MILLISECONDS = 2000;

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

const REFRESH_DEMAND_UNIMPLEMENTED_WARNING_INTERVAL_MILLISECONDS = 60000;

/** Timeout configuration for the Windows helper source client. */
export interface WindowsHelperSourceTimeouts {
    readonly healthMilliseconds: number;
    readonly readSnapshotMilliseconds: number;
    readonly listDescriptorsMilliseconds: number;
    readonly setRefreshDemandMilliseconds: number;
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

/** Options for the Windows helper source client. */
export interface WindowsHelperSourceClientOptions {
    readonly pipeName?: string;
    readonly transport?: WindowsHelperGrpcTransport;
    /** Monotonic test seam for cooldowns, durations, and retry windows. */
    readonly monotonicNow?: () => number;
    /** Wall-clock test seam for user-visible status and sample age timestamps. */
    readonly wallClockNow?: () => number;
    readonly timeouts?: Partial<WindowsHelperSourceTimeouts>;
    readonly descriptorPreloadRetryMilliseconds?: number;
    readonly descriptorPreloadTimer?: WindowsHelperDescriptorPreloadTimer;
    readonly serviceStatusReader?: WindowsHelperServiceStatusReader;
}

/** Sends source API requests to the installed Windows helper over a named pipe. */
export class WindowsHelperSourceClient implements SourceClient {
    readonly sourceId = WINDOWS_HELPER_SOURCE_ID;

    private readonly transport: WindowsHelperGrpcTransport;
    private readonly monotonicNow: () => number;
    private readonly wallClockNow: () => number;
    private readonly timeouts: WindowsHelperSourceTimeouts;
    private readonly descriptorPreloadRetryMilliseconds: number;
    private readonly descriptorPreloadTimer: WindowsHelperDescriptorPreloadTimer;
    private readonly serviceStatusReader: WindowsHelperServiceStatusReader;
    private protocolCompatibility: "unknown" | "supported" = "unknown";
    private protocolCheckPromise: Promise<void> | undefined;
    private unsupportedProtocolRetryAfterMonotonicMilliseconds = 0;
    private helperUnavailableRetryAfterMonotonicMilliseconds = 0;
    private helperUnavailableFailureCount = 0;
    private helperResumeRecoveryGraceEndsAtMonotonicMilliseconds = 0;
    private activeHelperDemandStartedAtMonotonicMilliseconds: number | undefined;
    private serviceStatusProbePromise: Promise<void> | undefined;
    private serviceStatusCacheExpiresAtMonotonicMilliseconds = 0;
    private cachedServiceStatus: WindowsHelperServiceStatus = "unknown";
    private status: SourceClientStatus = { state: "unknown" };
    private descriptorFingerprint: string | undefined;
    private hasCompleteDescriptorSnapshot = false;
    private descriptorPreloadStartedAtMonotonicMilliseconds: number | undefined;
    private descriptorPreloadPromise: Promise<void> | undefined;
    private descriptorPreloadRetryTimer: WindowsHelperDescriptorPreloadTimerHandle | undefined;
    private readonly descriptorsByMetricId = new Map<string, MetricDescriptor>();
    private readonly sourceMetadataInvalidationListeners = new Set<SourceMetadataInvalidationListener>();

    constructor(options: WindowsHelperSourceClientOptions = {}) {
        const monotonicNow = options.monotonicNow ?? monotonicNowMilliseconds;
        const wallClockNow = options.wallClockNow ?? wallClockNowMilliseconds;

        this.transport = options.transport ?? new NodeWindowsHelperGrpcTransport(
            buildWindowsNamedPipeGrpcTarget(options.pipeName ?? DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME),
            monotonicNow,
            wallClockNow,
        );
        this.monotonicNow = monotonicNow;
        this.wallClockNow = wallClockNow;
        this.timeouts = {
            healthMilliseconds: options.timeouts?.healthMilliseconds
                ?? DEFAULT_HEALTH_TIMEOUT_MILLISECONDS,
            readSnapshotMilliseconds: options.timeouts?.readSnapshotMilliseconds
                ?? DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS,
            listDescriptorsMilliseconds: options.timeouts?.listDescriptorsMilliseconds
                ?? DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS,
            setRefreshDemandMilliseconds: options.timeouts?.setRefreshDemandMilliseconds
                ?? DEFAULT_SET_REFRESH_DEMAND_TIMEOUT_MILLISECONDS,
        };
        this.descriptorPreloadRetryMilliseconds = options.descriptorPreloadRetryMilliseconds
            ?? DEFAULT_DESCRIPTOR_PRELOAD_RETRY_MILLISECONDS;
        this.descriptorPreloadTimer = options.descriptorPreloadTimer ?? nodeDescriptorPreloadTimer;
        this.serviceStatusReader = options.serviceStatusReader ?? windowsServiceStatusReader;
        this.beginHelperRecoveryGrace(monotonicNow());
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        this.markHelperDemandActive();
        await this.ensureProtocolSupported();

        const requestStartedAtMonotonicMilliseconds = this.monotonicNow();
        let readResponse: ReadMetricSnapshotResponse;
        try {
            readResponse = await this.sendGrpcRequest(
                "ReadMetricSnapshot",
                this.timeouts.readSnapshotMilliseconds,
                timeoutMilliseconds => this.transport.readMetricSnapshot(
                    create(ReadMetricSnapshotRequestSchema, {
                        metricIds: [...metricKeys],
                        includeDescriptors: false,
                    }),
                    { timeoutMilliseconds },
                ),
            );
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        const snapshot = readResponse.snapshot;
        if (!snapshot) {
            const error = new WindowsHelperSourceClientError(
                "Windows source returned a snapshot response without a snapshot.",
                "missing_snapshot",
                "sourceError",
            );
            this.recordHelperRequestFailure(error);
            throw error;
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
        this.logSnapshotRead(metricKeys, snapshot, requestStartedAtMonotonicMilliseconds, timestampMilliseconds);
        const sourceMetadata = toRuntimeSnapshotMetadata({
            requestedMetricKeys: metricKeys,
            snapshot,
            valueProvenance: readResponse.valueProvenance,
            unavailableMetrics: readResponse.unavailableMetrics,
        });

        return {
            snapshot,
            valueMetadata: sourceMetadata.valueMetadata,
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

    async setMetricRefreshDemand(groups: readonly SourceRefreshDemandGroup[]): Promise<void> {
        this.markHelperDemandActive();
        await this.ensureProtocolSupported();

        try {
            await this.sendGrpcRequest(
                "SetMetricRefreshDemand",
                this.timeouts.setRefreshDemandMilliseconds,
                timeoutMilliseconds => this.transport.setMetricRefreshDemand(
                    create(SetMetricRefreshDemandRequestSchema, {
                        groups: groups.map(group => ({
                            pollingGroupId: group.pollingGroupId,
                            metricIds: [...group.metricKeys],
                            requestedIntervalMilliseconds: group.intervalMilliseconds,
                        })),
                    }),
                    { timeoutMilliseconds },
                ),
                shouldResetRefreshDemandChannelAfterError,
            );
            this.recordHelperRequestSuccess();
        } catch (error) {
            if (isRefreshDemandUnsupportedError(error)) {
                log.atWarn()
                    .everyMs(
                        "refresh-demand-unimplemented",
                        REFRESH_DEMAND_UNIMPLEMENTED_WARNING_INTERVAL_MILLISECONDS,
                    )
                    .log("Windows helper does not support refresh demand control yet.");
                return;
            }

            if (isInvalidRefreshDemandRequestError(error)) {
                throw new SourceRefreshDemandError("invalidDemand", toError(error).message);
            }

            if (isRefreshDemandControlPlaneError(error)) {
                throw error;
            }

            this.recordHelperRequestFailure(error);
            throw error;
        }
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
                this.descriptorPreloadStartedAtMonotonicMilliseconds = undefined;
            }
        };
    }

    private async readMetricDescriptors(metricKeys: readonly string[]): Promise<MetricDescriptorSnapshot> {
        const isCompleteCatalogResponse = metricKeys.length === 0;
        let listResponse: ListMetricDescriptorsResponse;
        try {
            listResponse = await this.sendGrpcRequest(
                "ListMetricDescriptors",
                this.timeouts.listDescriptorsMilliseconds,
                timeoutMilliseconds => this.transport.listMetricDescriptors(
                    create(ListMetricDescriptorsRequestSchema, {
                        metricIds: [...metricKeys],
                    }),
                    { timeoutMilliseconds },
                ),
            );
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        const descriptorSnapshot = listResponse.descriptorSnapshot;
        if (!descriptorSnapshot) {
            const error = new WindowsHelperSourceClientError(
                "Windows source returned a descriptor response without a descriptor snapshot.",
                "missing_descriptor_snapshot",
                "sourceError",
            );
            this.recordHelperRequestFailure(error);
            throw error;
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
        const response = await this.sendGrpcRequest(
            "GetSourceHealth",
            this.timeouts.healthMilliseconds,
            timeoutMilliseconds => this.transport.getSourceHealth(
                create(GetSourceHealthRequestSchema),
                { timeoutMilliseconds },
            ),
        );

        return toRuntimeSourceHealth(response);
    }

    private startDescriptorPreload(): void {
        if (this.descriptorPreloadPromise) {
            return;
        }

        this.descriptorPreloadStartedAtMonotonicMilliseconds ??= this.monotonicNow();
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
        const descriptorPreloadStartedAtMonotonicMilliseconds = this.descriptorPreloadStartedAtMonotonicMilliseconds;

        if (
            descriptorPreloadStartedAtMonotonicMilliseconds !== undefined
            && (
                this.monotonicNow() - descriptorPreloadStartedAtMonotonicMilliseconds
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

        this.descriptorPreloadStartedAtMonotonicMilliseconds = undefined;

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

        const invalidationReason = !hadCompleteDescriptorSnapshot
            ? "descriptorLoaded"
            : previousDescriptorFingerprint === descriptorSnapshot.descriptorFingerprint
                ? undefined
                : previousDescriptorFingerprint === undefined
                    ? "descriptorLoaded"
                    : "descriptorChanged";

        if (invalidationReason) {
            this.logDescriptorCatalogSummary(invalidationReason);
        }

        return invalidationReason;
    }

    private logDescriptorCatalogSummary(reason: SourceMetadataInvalidationReason): void {
        const pollingGroupIds = new Set<string>();
        for (const descriptor of this.descriptorsByMetricId.values()) {
            pollingGroupIds.add(descriptor.pollingGroupId);
        }

        log.info(() => [
            "windowsHelperDescriptorCatalogLoaded",
            `reason=${reason}`,
            `descriptorCount=${this.descriptorsByMetricId.size}`,
            `pollingGroupCount=${pollingGroupIds.size}`,
            `fingerprint=${this.descriptorFingerprint ?? ""}`,
        ].join(" "));
    }

    dispose(): void {
        this.clearDescriptorPreloadRetry();
        this.descriptorPreloadStartedAtMonotonicMilliseconds = undefined;
        this.sourceMetadataInvalidationListeners.clear();
        this.transport.dispose?.();
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    notifyProcessResumed(): void {
        const nowMilliseconds = this.monotonicNow();
        this.helperUnavailableRetryAfterMonotonicMilliseconds = 0;
        this.helperUnavailableFailureCount = 0;
        this.beginHelperRecoveryGrace(nowMilliseconds);
        // The cached service status may predate the suspend; re-probe so
        // pipe-missing failures classify against the current service state.
        this.serviceStatusCacheExpiresAtMonotonicMilliseconds = 0;
        this.refreshCachedServiceStatus();
        this.clearUnavailableRetryAfterStatus();
    }

    private async ensureProtocolSupported(): Promise<void> {
        const nowMilliseconds = this.monotonicNow();

        if (nowMilliseconds < this.unsupportedProtocolRetryAfterMonotonicMilliseconds) {
            throw new Error("Windows source protocol is unsupported and still inside retry cooldown.");
        }

        if (nowMilliseconds < this.helperUnavailableRetryAfterMonotonicMilliseconds) {
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

    private async sendGrpcRequest<TResponse>(
        methodName: string,
        timeoutMilliseconds: number,
        request: (timeoutMilliseconds: number) => Promise<TResponse>,
        shouldResetChannelAfterError: (error: Error) => boolean = shouldResetGrpcChannelAfterError,
    ): Promise<TResponse> {
        const requestStartedAtMonotonicMilliseconds = this.monotonicNow();

        try {
            const response = await request(timeoutMilliseconds);
            const requestCompletedAtMonotonicMilliseconds = this.monotonicNow();

            log.debug(() => [
                "windowsHelperGrpcRequestCompleted",
                "layer=client",
                `method=${methodName}`,
                `durationMs=${requestCompletedAtMonotonicMilliseconds - requestStartedAtMonotonicMilliseconds}`,
                `timeoutMs=${timeoutMilliseconds}`,
            ].join(" "));

            return response;
        } catch (error) {
            const normalizedError = normalizeGrpcRequestError(error, methodName);
            if (shouldResetChannelAfterError(normalizedError)) {
                this.transport.reset?.();
            }

            const requestCompletedAtMonotonicMilliseconds = this.monotonicNow();

            log.debug(() => [
                "windowsHelperGrpcRequestFailed",
                "layer=client",
                `method=${methodName}`,
                `durationMs=${requestCompletedAtMonotonicMilliseconds - requestStartedAtMonotonicMilliseconds}`,
                `timeoutMs=${timeoutMilliseconds}`,
                `error=${normalizedError.message}`,
            ].join(" "));

            throw normalizedError;
        }
    }

    private recordUnsupportedProtocol(errorCode: string): void {
        const nowMilliseconds = this.monotonicNow();
        const wallClockNowMilliseconds = this.wallClockNow();
        this.protocolCompatibility = "unknown";
        this.unsupportedProtocolRetryAfterMonotonicMilliseconds = nowMilliseconds
            + UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS;
        this.status = {
            state: "unsupported",
            reason: "protocolMismatch",
            retryAfterTimestampMilliseconds: wallClockNowMilliseconds
                + UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS,
            lastErrorCode: errorCode,
            lastFailureAtTimestampMilliseconds: wallClockNowMilliseconds,
        };
    }

    private recordHelperRequestFailure(error: unknown): void {
        if (isUnsupportedProtocolError(error)) {
            this.recordUnsupportedProtocol(toWindowsHelperSourceClientError(error).code);
            return;
        }

        const nowMilliseconds = this.monotonicNow();
        const wallClockNowMilliseconds = this.wallClockNow();
        const failure = classifyHelperRequestFailure(error);
        const cooldownMilliseconds = failure.reason === "pipeMissing"
            ? this.selectPipeMissingRetryCooldownMilliseconds(nowMilliseconds)
            : this.nextUnavailableRetryCooldownMilliseconds(nowMilliseconds);

        this.helperUnavailableRetryAfterMonotonicMilliseconds = nowMilliseconds + cooldownMilliseconds;
        this.status = {
            state: "unavailable",
            reason: this.refinePipeMissingReason(failure.reason),
            retryAfterTimestampMilliseconds: wallClockNowMilliseconds + cooldownMilliseconds,
            ...(failure.errorCode ? { lastErrorCode: failure.errorCode } : {}),
            lastErrorMessage: toError(error).message,
            lastFailureAtTimestampMilliseconds: wallClockNowMilliseconds,
        };

        if (failure.reason === "pipeMissing") {
            this.refreshCachedServiceStatus();
        }
    }

    private recordHelperRequestSuccess(health?: SourceHealth): void {
        this.unsupportedProtocolRetryAfterMonotonicMilliseconds = 0;
        this.helperUnavailableRetryAfterMonotonicMilliseconds = 0;
        this.helperUnavailableFailureCount = 0;
        this.helperResumeRecoveryGraceEndsAtMonotonicMilliseconds = 0;
        this.activeHelperDemandStartedAtMonotonicMilliseconds = undefined;
        this.cachedServiceStatus = "running";
        this.serviceStatusCacheExpiresAtMonotonicMilliseconds = this.monotonicNow()
            + HELPER_SERVICE_STATUS_CACHE_MILLISECONDS;
        this.status = {
            state: "available",
            protocolVersion: health?.protocolVersion ?? this.status.protocolVersion ?? SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
            ...(health?.helperVersion ? { helperVersion: health.helperVersion } : {}),
            lastSuccessAtTimestampMilliseconds: this.wallClockNow(),
        };
    }

    private markHelperDemandActive(): void {
        if (this.activeHelperDemandStartedAtMonotonicMilliseconds !== undefined) {
            return;
        }

        this.activeHelperDemandStartedAtMonotonicMilliseconds = this.monotonicNow();
        this.refreshCachedServiceStatus();
    }

    private beginHelperRecoveryGrace(nowMilliseconds: number): void {
        this.helperResumeRecoveryGraceEndsAtMonotonicMilliseconds =
            nowMilliseconds + HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS;
    }

    private selectPipeMissingRetryCooldownMilliseconds(nowMilliseconds: number): number {
        const activeWindowStartedAt = this.activeHelperDemandStartedAtMonotonicMilliseconds;

        if (
            nowMilliseconds < this.helperResumeRecoveryGraceEndsAtMonotonicMilliseconds
            || (
                activeWindowStartedAt !== undefined
                && nowMilliseconds - activeWindowStartedAt < ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS
            )
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
        const nowMilliseconds = this.monotonicNow();

        if (nowMilliseconds < this.serviceStatusCacheExpiresAtMonotonicMilliseconds
            || this.serviceStatusProbePromise) {
            return;
        }

        this.serviceStatusProbePromise = this.serviceStatusReader.readStatus()
            .then(status => {
                this.cachedServiceStatus = status;
                this.serviceStatusCacheExpiresAtMonotonicMilliseconds =
                    this.monotonicNow() + HELPER_SERVICE_STATUS_CACHE_MILLISECONDS;

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

    private nextUnavailableRetryCooldownMilliseconds(nowMilliseconds: number): number {
        // Failures inside the startup/resume grace stay on the first rung and
        // are not counted, so a correlated reconnect burst cannot escalate the
        // ladder while the helper is still waking.
        if (nowMilliseconds < this.helperResumeRecoveryGraceEndsAtMonotonicMilliseconds) {
            return HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[0];
        }

        this.helperUnavailableFailureCount += 1;

        const cooldownMilliseconds = selectHelperUnavailableRetryCooldownMilliseconds(
            this.helperUnavailableFailureCount,
        );

        if (this.activeHelperDemandStartedAtMonotonicMilliseconds === undefined) {
            return cooldownMilliseconds;
        }

        return Math.min(cooldownMilliseconds, ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS);
    }

    /**
     * Removes the retry-after hint from the surfaced status after resume.
     *
     * The state deliberately stays "unavailable": resume does not prove the
     * helper is back, it only invalidates the pre-suspend cooldown deadline
     * that status consumers would otherwise keep displaying.
     */
    private clearUnavailableRetryAfterStatus(): void {
        if (this.status.state !== "unavailable" || this.status.retryAfterTimestampMilliseconds === undefined) {
            return;
        }

        const statusWithoutRetryAfter = { ...this.status };
        delete statusWithoutRetryAfter.retryAfterTimestampMilliseconds;
        this.status = statusWithoutRetryAfter;
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
        requestStartedAtMonotonicMilliseconds: number,
        sampleTimestampMilliseconds: number,
    ): void {
        const completedAtMonotonicMilliseconds = this.monotonicNow();
        const completedAtWallClockTimestampMilliseconds = this.wallClockNow();

        log.atInfo()
            .everyMs("helper-snapshot-read", HELPER_SNAPSHOT_READ_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "helperSnapshotRead",
                ...formatHelperSnapshotMetricKeys(metricKeys),
                `durationMs=${completedAtMonotonicMilliseconds - requestStartedAtMonotonicMilliseconds}`,
                `sampleAgeMs=${completedAtWallClockTimestampMilliseconds - sampleTimestampMilliseconds}`,
                `snapshotMetricCount=${Object.keys(snapshot.metrics).length}`,
                `cpuUsagePercent=${readScalarMetricValue(snapshot, CPU_USAGE_METRIC_KEY) ?? ""}`,
            ].join(" "));

        const sampleAgeMilliseconds = completedAtWallClockTimestampMilliseconds - sampleTimestampMilliseconds;
        if (sampleAgeMilliseconds < HELPER_SNAPSHOT_STALE_DIAGNOSTIC_THRESHOLD_MILLISECONDS) {
            return;
        }

        log.atInfo()
            .everyMs("helper-snapshot-stale", HELPER_SNAPSHOT_STALE_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "helperSnapshotReadStale",
                ...formatHelperSnapshotMetricKeys(metricKeys),
                `durationMs=${completedAtMonotonicMilliseconds - requestStartedAtMonotonicMilliseconds}`,
                `sampleAgeMs=${sampleAgeMilliseconds}`,
                `snapshotMetricCount=${Object.keys(snapshot.metrics).length}`,
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

function formatHelperSnapshotMetricKeys(metricKeys: readonly string[]): readonly string[] {
    if (metricKeys.length <= HELPER_SNAPSHOT_FULL_KEY_LOG_LIMIT) {
        return [
            `metricCount=${metricKeys.length}`,
            `metricKeys=${metricKeys.join(",")}`,
        ];
    }

    // Stream Deck MK.2 has 15 keys; 16 covers MK.2, Neo, and Plus without
    // dumping XL-style high-key-count profiles into production logs.
    const metricKeySample = metricKeys.slice(0, HELPER_SNAPSHOT_FULL_KEY_LOG_LIMIT);
    return [
        `metricCount=${metricKeys.length}`,
        `metricKeySample=${metricKeySample.join(",")}`,
        `omittedMetricCount=${metricKeys.length - metricKeySample.length}`,
    ];
}

const nodeDescriptorPreloadTimer: WindowsHelperDescriptorPreloadTimer = {
    set: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clear: handle => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
};

function selectHelperUnavailableRetryCooldownMilliseconds(failureCount: number): number {
    const maximumBackoffMilliseconds = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[2];
    const backoffIndex = Math.min(
        Math.max(0, failureCount - 1),
        HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS.length - 1,
    );

    return HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[backoffIndex] ?? maximumBackoffMilliseconds;
}

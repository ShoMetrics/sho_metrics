import { create } from "@bufbuild/protobuf";
import { logger } from "../../../logging/logger";
import {
    GetSourceHealthRequestSchema,
    ListMetricDescriptorsRequestSchema,
    ReadMetricSnapshotRequestSchema,
    SetMetricRefreshDemandRequestSchema,
    type ListMetricDescriptorsResponse,
    type ReadMetricSnapshotResponse,
} from "../../../generated/shometrics/v1/source_api_pb.js";
import {
    readMetricSnapshotTimestampMilliseconds,
    type MetricSnapshot,
} from "../metric-source";
import {
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
    isUnsupportedProtocolError,
    normalizeGrpcRequestError,
    shouldResetGrpcChannelAfterError,
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

const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
const DEFAULT_HEALTH_TIMEOUT_MILLISECONDS = 750;
const DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS = 2000;
const DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS = 5000;
const DEFAULT_SET_REFRESH_DEMAND_TIMEOUT_MILLISECONDS = 1000;

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
    readonly now?: () => number;
    readonly timeouts?: Partial<WindowsHelperSourceTimeouts>;
    readonly descriptorPreloadRetryMilliseconds?: number;
    readonly descriptorPreloadTimer?: WindowsHelperDescriptorPreloadTimer;
    readonly serviceStatusReader?: WindowsHelperServiceStatusReader;
}

/** Sends source API requests to the installed Windows helper over a named pipe. */
export class WindowsHelperSourceClient implements SourceClient {
    readonly sourceId = WINDOWS_HELPER_SOURCE_ID;

    private readonly transport: WindowsHelperGrpcTransport;
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
        const now = options.now ?? Date.now;

        this.transport = options.transport ?? new NodeWindowsHelperGrpcTransport(
            buildWindowsNamedPipeGrpcTarget(options.pipeName ?? DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME),
            now,
        );
        this.now = now;
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
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        this.markHelperDemandActive();
        await this.ensureProtocolSupported();

        const requestStartedAtTimestampMilliseconds = this.now();
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
                this.descriptorPreloadStartedAtTimestampMilliseconds = undefined;
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

    private async sendGrpcRequest<TResponse>(
        methodName: string,
        timeoutMilliseconds: number,
        request: (timeoutMilliseconds: number) => Promise<TResponse>,
        shouldResetChannelAfterError: (error: Error) => boolean = shouldResetGrpcChannelAfterError,
    ): Promise<TResponse> {
        const requestStartedAtTimestampMilliseconds = this.now();

        try {
            const response = await request(timeoutMilliseconds);
            const requestCompletedAtTimestampMilliseconds = this.now();

            log.debug(() => [
                "windowsHelperGrpcRequestCompleted",
                "layer=client",
                `method=${methodName}`,
                `durationMs=${requestCompletedAtTimestampMilliseconds - requestStartedAtTimestampMilliseconds}`,
                `timeoutMs=${timeoutMilliseconds}`,
            ].join(" "));

            return response;
        } catch (error) {
            const normalizedError = normalizeGrpcRequestError(error, methodName);
            if (shouldResetChannelAfterError(normalizedError)) {
                this.transport.reset?.();
            }

            const requestCompletedAtTimestampMilliseconds = this.now();

            log.debug(() => [
                "windowsHelperGrpcRequestFailed",
                "layer=client",
                `method=${methodName}`,
                `durationMs=${requestCompletedAtTimestampMilliseconds - requestStartedAtTimestampMilliseconds}`,
                `timeoutMs=${timeoutMilliseconds}`,
                `error=${normalizedError.message}`,
            ].join(" "));

            throw normalizedError;
        }
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
            this.recordUnsupportedProtocol(toWindowsHelperSourceClientError(error).code);
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

function isRefreshDemandUnsupportedError(error: unknown): boolean {
    const clientError = toWindowsHelperSourceClientError(error);
    return clientError.code === "grpc_unimplemented";
}

function isRefreshDemandControlPlaneError(error: unknown): boolean {
    const clientError = toWindowsHelperSourceClientError(error);
    return clientError.code === "grpc_invalid_argument"
        || clientError.code === "grpc_resource_exhausted";
}

function shouldResetRefreshDemandChannelAfterError(error: Error): boolean {
    return !isRefreshDemandUnsupportedError(error)
        && shouldResetGrpcChannelAfterError(error);
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

function selectHelperUnavailableRetryCooldownMilliseconds(failureCount: number): number {
    const maximumBackoffMilliseconds = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[2];
    const backoffIndex = Math.min(
        Math.max(0, failureCount - 1),
        HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS.length - 1,
    );

    return HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[backoffIndex] ?? maximumBackoffMilliseconds;
}

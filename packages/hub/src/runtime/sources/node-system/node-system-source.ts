import si, { type Systeminformation } from "systeminformation";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    buildTextMetricValue,
    MetricUnit,
    type MetricSource,
    type MetricSnapshot,
    type MetricValue,
} from "../metric-source";
import { logger } from "../../../logging/logger";
import {
    monotonicNowMilliseconds,
    wallClockNowMilliseconds,
} from "../../../shared/clock";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../../network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    isNetworkMetricKey,
    type NetworkMetricDirection,
} from "../../network-metric-keys";
import { diskVolumeRegistry, type DiskVolumeOption } from "../../disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    isDiskMetricKey,
    isDiskThroughputMetricKey,
    isDiskUsageMetricKey,
} from "../../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    isCpuMetricKey,
    isGpuMetricKey,
    isRamMetricKey,
} from "../../metric-keys";
import { formatCpuModelText, isFinitePositiveNumber } from "./node-system-cpu";
import {
    calculatePercent,
    filterUsableFileSystems,
    normalizeNullableRate,
    resolveDefaultDiskVolume,
    toDiskVolumeOption,
} from "./node-system-disk";
import {
    getActiveNvidiaSmiQueryCount,
    pollDarwinIoAcceleratorGpuTelemetry,
    pollSystemInformationGpuTelemetry,
    pollWindowsNvidiaGpuTelemetry,
    reserveNodeSystemGpuPollDebugSequence,
} from "./node-system-gpu";
import {
    calculateNetworkRate,
    formatNetworkInterfaceOptionDebug,
    formatNetworkRateCalculationDebug,
    formatNetworkStatDebug,
    formatRawNetworkInterfaceDebug,
    isUsableNetworkInterface,
    toNetworkInterfaceOption,
} from "./node-system-network";
import type {
    NodeSystemGpuTelemetryData,
    NodeSystemInformationClient,
    NodeSystemMetricGroup,
    NodeSystemNetworkCounterSample,
    NodeSystemNetworkRateCalculation,
} from "./node-system-source-types";
import { BackoffPolicy } from "../backoff-policy";
import { RefreshableCache, type RefreshableCacheReadResult } from "../refreshable-cache";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";
import { NODE_SYSTEM_SOURCE_ID } from "../source-ids";

const log = logger.for("Source:NodeSystem");
const networkLog = logger.for("Source:NodeSystem:Network");
const gpuLog = logger.for("Source:NodeSystem:GPU");
const BYTES_PER_MEBIBYTE = 1024 * 1024;
const HERTZ_PER_GIGAHERTZ = 1000 * 1000 * 1000;

const {
    // Do not use. systeminformation v5 documents this as unreliable on Windows
    // and macOS, and it caused multi-second polling stalls here. Use one-shot
    // cpu().speed for static base frequency, or display no frequency.
    cpuCurrentSpeed: blockedCpuCurrentSpeed,
    ...rawSystemInformation
}: typeof si = si;

void blockedCpuCurrentSpeed;

const defaultSystemInformation: NodeSystemInformationClient = rawSystemInformation;

export interface NodeSystemNetworkInterfaceRegistry {
    update(options: readonly NetworkInterfaceOption[]): void;
}

export interface NodeSystemDiskVolumeRegistry {
    update(options: readonly DiskVolumeOption[]): void;
}

interface NodeSystemSourceDependencies {
    systemInformation?: NodeSystemInformationClient;
    networkRegistry?: NodeSystemNetworkInterfaceRegistry;
    diskRegistry?: NodeSystemDiskVolumeRegistry;
    platform?: NodeJS.Platform;
    /**
     * Monotonic test seam used for elapsed-time/cache/backoff decisions.
     */
    monotonicNow?: () => number;
    /**
     * Wall-clock test seam used only for metric snapshot captured_at.
     */
    wallClockNow?: () => number;
    pollWindowsGpuTelemetry?: () => Promise<NodeSystemGpuTelemetryData | null>;
    pollDarwinGpuTelemetry?: () => Promise<NodeSystemGpuTelemetryData | null>;
    pollSystemInformationGpuTelemetry?: (
        systemInformation: NodeSystemInformationClient,
    ) => Promise<NodeSystemGpuTelemetryData | null>;
}

interface CachedNetworkInterfaces {
    readonly rawNetworkInterfaces: readonly Systeminformation.NetworkInterfacesData[];
    readonly interfaceOptions: readonly NetworkInterfaceOption[];
}

interface CachedCpuInformation {
    readonly baseFrequencyGigahertz: number | null;
    readonly modelText: string | null;
}

/**
 * Node.js runtime metric source backed by `systeminformation` and OS command helpers.
 */
export class NodeSystemSource implements MetricSource {
    readonly sourceId = NODE_SYSTEM_SOURCE_ID;

    private readonly systemInformation: NodeSystemInformationClient;
    private readonly networkRegistry: NodeSystemNetworkInterfaceRegistry;
    private readonly diskRegistry: NodeSystemDiskVolumeRegistry;
    private readonly platform: NodeJS.Platform;
    private readonly monotonicNow: () => number;
    private readonly wallClockNow: () => number;
    private readonly pollWindowsGpuTelemetry: () => Promise<NodeSystemGpuTelemetryData | null>;
    private readonly pollDarwinGpuTelemetry: () => Promise<NodeSystemGpuTelemetryData | null>;
    private readonly pollSystemInformationGpuTelemetry: (
        systemInformation: NodeSystemInformationClient,
    ) => Promise<NodeSystemGpuTelemetryData | null>;
    private readonly networkInterfaceCache: RefreshableCache<CachedNetworkInterfaces>;
    private readonly networkInterfaceRefreshBackoff: BackoffPolicy;
    private readonly cpuInformationCache: RefreshableCache<CachedCpuInformation>;
    private readonly cpuInformationRefreshBackoff: BackoffPolicy;
    private lastNetworkStatsByInterface = new Map<string, NodeSystemNetworkCounterSample>();
    private lastNetworkPollDebugLogMonotonicMilliseconds = 0;
    private cachedGpuData: NodeSystemGpuTelemetryData | null = null;
    private cachedGpuMonotonicMilliseconds = 0;
    private pendingGpuPromise: Promise<NodeSystemGpuTelemetryData | null> | null = null;

    private static readonly GPU_CACHE_MS = 1000;
    // Static CPU info is not worth querying every 1 Hz tick, but a transient
    // startup failure should not hide model/base-frequency for the whole session.
    private static readonly CPU_INFORMATION_RETRY_MS = 60000;
    // Interface topology is semi-static. Cache discovery for 10s to keep networkInterfaces()
    // out of the 1Hz hot path while bounding Wi-Fi/VPN/USB adapter hot-plug staleness.
    private static readonly NETWORK_INTERFACE_CACHE_MS = 10000;
    // Expire topology after three missed discovery windows. Short query failures
    // keep last-good topology; sustained failures become no-data instead of
    // presenting stale Wi-Fi/VPN/USB adapter state indefinitely.
    private static readonly NETWORK_INTERFACE_STALE_MAX_MS = NodeSystemSource.NETWORK_INTERFACE_CACHE_MS * 3;
    // When discovery fails, stale last-good interfaces are safer than a 1Hz N/A flicker,
    // but retry throttling prevents a failing OS query loop from becoming the hot path.
    private static readonly NETWORK_INTERFACE_REFRESH_RETRY_MS = 2000;
    private static readonly NETWORK_INTERFACE_STALE_WARNING_INTERVAL_MS = 30000;
    private static readonly NETWORK_DEBUG_LOG_INTERVAL_MS = 5000;

    constructor(dependencies: NodeSystemSourceDependencies = {}) {
        this.systemInformation = dependencies.systemInformation ?? defaultSystemInformation;
        this.networkRegistry = dependencies.networkRegistry ?? networkInterfaceRegistry;
        this.diskRegistry = dependencies.diskRegistry ?? diskVolumeRegistry;
        this.platform = dependencies.platform ?? process.platform;
        this.monotonicNow = dependencies.monotonicNow ?? monotonicNowMilliseconds;
        this.wallClockNow = dependencies.wallClockNow ?? wallClockNowMilliseconds;
        this.pollWindowsGpuTelemetry = dependencies.pollWindowsGpuTelemetry ?? pollWindowsNvidiaGpuTelemetry;
        this.pollDarwinGpuTelemetry = dependencies.pollDarwinGpuTelemetry ?? pollDarwinIoAcceleratorGpuTelemetry;
        this.pollSystemInformationGpuTelemetry = dependencies.pollSystemInformationGpuTelemetry
            ?? pollSystemInformationGpuTelemetry;
        this.networkInterfaceCache = new RefreshableCache({
            now: this.monotonicNow,
            ttlMilliseconds: NodeSystemSource.NETWORK_INTERFACE_CACHE_MS,
            maximumStaleMilliseconds: NodeSystemSource.NETWORK_INTERFACE_STALE_MAX_MS,
            refresh: () => this.refreshUsableNetworkInterfaces(),
        });
        this.networkInterfaceRefreshBackoff = BackoffPolicy.flat(
            this.monotonicNow,
            NodeSystemSource.NETWORK_INTERFACE_REFRESH_RETRY_MS,
        );
        this.cpuInformationCache = new RefreshableCache({
            now: this.monotonicNow,
            ttlMilliseconds: Number.POSITIVE_INFINITY,
            maximumStaleMilliseconds: Number.POSITIVE_INFINITY,
            refresh: () => this.readCpuInformation(),
        });
        this.cpuInformationRefreshBackoff = BackoffPolicy.flat(
            this.monotonicNow,
            NodeSystemSource.CPU_INFORMATION_RETRY_MS,
        );
    }

    async poll(): Promise<MetricSnapshot> {
        return this.pollMetrics([]);
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        const resolutions = new Map<string, SourceMetricPollingGroupResolution>();

        for (const metricKey of metricKeys) {
            if (this.platform === "darwin"
                && isGpuMetricKey(metricKey)
                && metricKey !== GPU_USAGE_METRIC_KEY) {
                resolutions.set(metricKey, { state: "unsupported" });
                continue;
            }

            const metricGroup = resolveNodeSystemMetricGroup(metricKey);

            resolutions.set(metricKey, metricGroup
                ? { state: "owned", pollingGroupId: metricGroup }
                : { state: "unknown" });
        }

        return resolutions;
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<MetricSnapshot> {
        const metrics: Record<string, MetricValue> = {};
        const metricGroups = resolveCollectorGroups(metricKeys);
        const snapshotTimestampMilliseconds = this.wallClockNow();

        const [cpuMetrics, memoryMetrics, diskMetrics, networkMetrics, gpu] = await Promise.all([
            metricGroups.has("cpu") ? this.pollCpu() : Promise.resolve({}),
            metricGroups.has("memory") ? this.pollMemory() : Promise.resolve({}),
            metricGroups.has("disk") ? this.pollDiskSafely(metricKeys) : Promise.resolve({}),
            metricGroups.has("network") ? this.pollNetworkSafely() : Promise.resolve({}),
            metricGroups.has("gpu") ? this.pollGpu() : Promise.resolve(null),
        ]);

        Object.assign(metrics, cpuMetrics, memoryMetrics, diskMetrics, networkMetrics);

        if (gpu) {
            if (typeof gpu.utilizationGpu === "number" && Number.isFinite(gpu.utilizationGpu)) {
                metrics[GPU_USAGE_METRIC_KEY] = buildScalarMetricValue(gpu.utilizationGpu, {
                    unit: MetricUnit.PERCENT,
                });
            }
            if (gpu.modelText) {
                metrics[GPU_MODEL_METRIC_KEY] = buildTextMetricValue(gpu.modelText);
            }
            if (typeof gpu.temperatureGpu === "number" && Number.isFinite(gpu.temperatureGpu)) {
                metrics[GPU_TEMP_METRIC_KEY] = buildScalarMetricValue(gpu.temperatureGpu, { unit: MetricUnit.CELSIUS });
            }
            if (typeof gpu.memoryUsed === "number" && Number.isFinite(gpu.memoryUsed)) {
                metrics[GPU_VRAM_USED_METRIC_KEY] = buildScalarMetricValue(
                    gpu.memoryUsed * BYTES_PER_MEBIBYTE,
                    { unit: MetricUnit.BYTES },
                );
            }
            if (typeof gpu.memoryTotal === "number" && Number.isFinite(gpu.memoryTotal)) {
                metrics[GPU_VRAM_TOTAL_METRIC_KEY] = buildScalarMetricValue(
                    gpu.memoryTotal * BYTES_PER_MEBIBYTE,
                    { unit: MetricUnit.BYTES },
                );
            }
            if (typeof gpu.powerDraw === "number" && Number.isFinite(gpu.powerDraw)) {
                metrics[GPU_POWER_METRIC_KEY] = buildScalarMetricValue(gpu.powerDraw, { unit: MetricUnit.WATTS });
            }
            if (typeof gpu.powerLimit === "number" && Number.isFinite(gpu.powerLimit)) {
                metrics[GPU_POWER_LIMIT_METRIC_KEY] = buildScalarMetricValue(gpu.powerLimit, { unit: MetricUnit.WATTS });
            }
        }

        return buildMetricSnapshot({
            timestampMilliseconds: snapshotTimestampMilliseconds,
            metrics,
        });
    }

    private async pollMemory(): Promise<Record<string, MetricValue>> {
        try {
            const memoryData = await this.systemInformation.mem();
            const usedBytes = resolveRamUsedBytes(memoryData, this.platform);

            return {
                [RAM_USED_METRIC_KEY]: buildScalarMetricValue(usedBytes, { unit: MetricUnit.BYTES }),
                [RAM_TOTAL_METRIC_KEY]: buildScalarMetricValue(memoryData.total, { unit: MetricUnit.BYTES }),
            };
        } catch (error) {
            log.error(() => `Memory poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollDiskSafely(metricKeys: readonly string[]): Promise<Record<string, MetricValue>> {
        try {
            return await this.pollDisk(metricKeys);
        } catch (error) {
            log.error(() => `Disk poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollDisk(metricKeys: readonly string[]): Promise<Record<string, MetricValue>> {
        const metrics: Record<string, MetricValue> = {};
        const shouldPollUsage = metricKeys.length === 0 || metricKeys.some(isDiskUsageMetricKey);
        const shouldPollThroughput = metricKeys.length === 0 || metricKeys.some(isDiskThroughputMetricKey);

        if (shouldPollUsage) {
            Object.assign(metrics, await this.pollDiskUsage());
        }

        if (shouldPollThroughput && this.platform === "darwin") {
            Object.assign(metrics, await this.pollDiskThroughput());
        }

        return metrics;
    }

    private async pollDiskUsage(): Promise<Record<string, MetricValue>> {
        const metrics: Record<string, MetricValue> = {};
        const [fileSystems, blockDevices, diskLayout] = await Promise.all([
            this.systemInformation.fsSize(),
            this.systemInformation.blockDevices().catch(error => {
                log.warn(() => `Block device poll error: ${String(error)}`);
                return [] as Systeminformation.BlockDevicesData[];
            }),
            this.systemInformation.diskLayout().catch(error => {
                log.warn(() => `Disk layout poll error: ${String(error)}`);
                return [] as Systeminformation.DiskLayoutData[];
            }),
        ]);
        const diskVolumes = filterUsableFileSystems(fileSystems, this.platform)
            .map(fileSystem => toDiskVolumeOption(fileSystem, blockDevices, diskLayout));
        const defaultDiskVolume = resolveDefaultDiskVolume(diskVolumes);

        this.diskRegistry.update(diskVolumes);

        for (const diskVolume of diskVolumes) {
            metrics[getDiskVolumeMetricKey("used", diskVolume.id)] = buildScalarMetricValue(diskVolume.usedBytes, { unit: MetricUnit.BYTES });
            metrics[getDiskVolumeMetricKey("total", diskVolume.id)] = buildScalarMetricValue(diskVolume.sizeBytes, { unit: MetricUnit.BYTES });
            metrics[getDiskVolumeMetricKey("available", diskVolume.id)] = buildScalarMetricValue(diskVolume.availableBytes, { unit: MetricUnit.BYTES });
            metrics[getDiskVolumeMetricKey("percent", diskVolume.id)] = buildScalarMetricValue(
                calculatePercent(diskVolume.usedBytes, diskVolume.sizeBytes),
                { unit: MetricUnit.PERCENT },
            );
        }

        if (defaultDiskVolume) {
            metrics[getDefaultDiskUsageMetricKey("used")] = buildScalarMetricValue(defaultDiskVolume.usedBytes, { unit: MetricUnit.BYTES });
            metrics[getDefaultDiskUsageMetricKey("total")] = buildScalarMetricValue(defaultDiskVolume.sizeBytes, { unit: MetricUnit.BYTES });
            metrics[getDefaultDiskUsageMetricKey("available")] = buildScalarMetricValue(defaultDiskVolume.availableBytes, { unit: MetricUnit.BYTES });
            metrics[getDefaultDiskUsageMetricKey("percent")] = buildScalarMetricValue(
                calculatePercent(defaultDiskVolume.usedBytes, defaultDiskVolume.sizeBytes),
                { unit: MetricUnit.PERCENT },
            );
        }

        return metrics;
    }

    private async pollDiskThroughput(): Promise<Record<string, MetricValue>> {
        const fileSystemStats = await this.systemInformation.fsStats();

        return {
            [getDiskThroughputMetricKey("read")]: buildScalarMetricValue(
                normalizeNullableRate(fileSystemStats.rx_sec),
                { unit: MetricUnit.BYTES_PER_SECOND },
            ),
            [getDiskThroughputMetricKey("write")]: buildScalarMetricValue(
                normalizeNullableRate(fileSystemStats.wx_sec),
                { unit: MetricUnit.BYTES_PER_SECOND },
            ),
            [getDiskThroughputMetricKey("total")]: buildScalarMetricValue(
                normalizeNullableRate(fileSystemStats.tx_sec),
                { unit: MetricUnit.BYTES_PER_SECOND },
            ),
        };
    }

    private async pollCpu(): Promise<Record<string, MetricValue>> {
        try {
            const load = await this.systemInformation.currentLoad();
            const metrics: Record<string, MetricValue> = {
                [CPU_USAGE_METRIC_KEY]: buildScalarMetricValue(load.currentLoad, {
                    unit: MetricUnit.PERCENT,
                }),
            };
            const cachedCpuInformation = this.cpuInformationCache.current();

            if (
                cachedCpuInformation.state !== "unavailable"
                && cachedCpuInformation.value.baseFrequencyGigahertz != null
            ) {
                metrics[CPU_BASE_FREQUENCY_METRIC_KEY] = buildScalarMetricValue(
                    cachedCpuInformation.value.baseFrequencyGigahertz * HERTZ_PER_GIGAHERTZ,
                    { unit: MetricUnit.HERTZ },
                );
            }
            if (cachedCpuInformation.state !== "unavailable" && cachedCpuInformation.value.modelText) {
                metrics[CPU_MODEL_METRIC_KEY] = buildTextMetricValue(cachedCpuInformation.value.modelText);
            }

            this.ensureCpuInformationCached();

            return metrics;
        } catch (error) {
            log.error(() => `CPU poll error: ${String(error)}`);
            return {};
        }
    }

    private ensureCpuInformationCached(): void {
        if (
            this.cpuInformationCache.current().state === "fresh"
            || this.cpuInformationCache.hasPendingRefresh()
            || !this.cpuInformationRefreshBackoff.canAttempt()
        ) {
            return;
        }

        void this.cpuInformationCache.read()
            .then(result => {
                if (result.state !== "unavailable") {
                    this.cpuInformationRefreshBackoff.recordSuccess();
                    return;
                }

                const retryMilliseconds = this.cpuInformationRefreshBackoff.recordFailure();
                log.warn(() => [
                    "CPU information poll error",
                    `retryMs=${retryMilliseconds}`,
                    `error=${String(result.error)}`,
                ].join(" "));
            });
    }

    private async readCpuInformation(): Promise<CachedCpuInformation> {
        const cpuData = await this.systemInformation.cpu();
        return {
            baseFrequencyGigahertz: isFinitePositiveNumber(cpuData.speed) ? cpuData.speed : null,
            modelText: formatCpuModelText(cpuData),
        };
    }

    private async pollNetworkSafely(): Promise<Record<string, MetricValue>> {
        try {
            return await this.pollNetwork();
        } catch (error) {
            networkLog.error(() => `Network poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollNetwork(): Promise<Record<string, MetricValue>> {
        const metrics: Record<string, MetricValue> = {};
        const cachedNetworkInterfaces = await this.readUsableNetworkInterfaces();
        if (!cachedNetworkInterfaces) {
            this.networkRegistry.update([]);
            return metrics;
        }

        const interfaceOptions = cachedNetworkInterfaces.interfaceOptions;
        const usableInterfaceIds = new Set(interfaceOptions.map((networkInterface) => networkInterface.id));
        const networkStats = usableInterfaceIds.size > 0
            ? await this.systemInformation.networkStats([...usableInterfaceIds].join(","))
            : [];
        const currentMonotonicMilliseconds = this.monotonicNow();
        let aggregateDownloadBytesPerSecond = 0;
        let aggregateUploadBytesPerSecond = 0;
        const rateCalculations: NodeSystemNetworkRateCalculation[] = [];

        this.networkRegistry.update(interfaceOptions);

        for (const networkStat of networkStats) {
            if (!usableInterfaceIds.has(networkStat.iface)) {
                continue;
            }

            const downloadRate = this.calculateNetworkRate({
                interfaceId: networkStat.iface,
                direction: "download",
                currentBytes: networkStat.rx_bytes,
                currentMonotonicMilliseconds,
            });
            const uploadRate = this.calculateNetworkRate({
                interfaceId: networkStat.iface,
                direction: "upload",
                currentBytes: networkStat.tx_bytes,
                currentMonotonicMilliseconds,
            });
            const downloadBytesPerSecond = downloadRate.bytesPerSecond;
            const uploadBytesPerSecond = uploadRate.bytesPerSecond;

            rateCalculations.push(downloadRate, uploadRate);

            metrics[getNetworkInterfaceMetricKey("download", networkStat.iface)] = buildScalarMetricValue(
                downloadBytesPerSecond,
                { unit: MetricUnit.BYTES_PER_SECOND },
            );
            metrics[getNetworkInterfaceMetricKey("upload", networkStat.iface)] = buildScalarMetricValue(
                uploadBytesPerSecond,
                { unit: MetricUnit.BYTES_PER_SECOND },
            );

            aggregateDownloadBytesPerSecond += downloadBytesPerSecond;
            aggregateUploadBytesPerSecond += uploadBytesPerSecond;
        }

        metrics[getNetworkAggregateMetricKey("download")] = buildScalarMetricValue(
            aggregateDownloadBytesPerSecond,
            { unit: MetricUnit.BYTES_PER_SECOND },
        );
        metrics[getNetworkAggregateMetricKey("upload")] = buildScalarMetricValue(
            aggregateUploadBytesPerSecond,
            { unit: MetricUnit.BYTES_PER_SECOND },
        );

        this.logNetworkPollDebug({
            networkInterfaces: cachedNetworkInterfaces.rawNetworkInterfaces,
            interfaceOptions,
            networkStats,
            rateCalculations,
            aggregateDownloadBytesPerSecond,
            aggregateUploadBytesPerSecond,
            currentMonotonicMilliseconds,
        });

        return metrics;
    }

    private async readUsableNetworkInterfaces(): Promise<CachedNetworkInterfaces | null> {
        const currentResult = this.networkInterfaceCache.current();
        if (currentResult.state === "fresh") {
            return currentResult.value;
        }

        if (!this.networkInterfaceRefreshBackoff.canAttempt()) {
            return currentResult.state === "stale" ? currentResult.value : null;
        }

        // Only the caller that starts a refresh records the backoff outcome.
        // Other callers may await the same in-flight refresh, but that should
        // not make one OS failure count as multiple consecutive failures.
        const shouldRecordRefreshOutcome = !this.networkInterfaceCache.hasPendingRefresh();
        const refreshedResult = await this.networkInterfaceCache.read();
        if (refreshedResult.state === "fresh") {
            if (shouldRecordRefreshOutcome) {
                this.networkInterfaceRefreshBackoff.recordSuccess();
            }
            return refreshedResult.value;
        }

        if (refreshedResult.error !== undefined && shouldRecordRefreshOutcome) {
            const retryMilliseconds = this.networkInterfaceRefreshBackoff.recordFailure();
            this.logNetworkInterfaceRefreshFailure(refreshedResult, retryMilliseconds);
        }

        return refreshedResult.state === "stale" ? refreshedResult.value : null;
    }

    private async refreshUsableNetworkInterfaces(): Promise<CachedNetworkInterfaces> {
        const networkInterfaces = await this.systemInformation.networkInterfaces();
        const usableNetworkInterfaces = Array.isArray(networkInterfaces)
            ? networkInterfaces.filter(networkInterface => isUsableNetworkInterface(networkInterface, this.platform))
            : [];
        return {
            rawNetworkInterfaces: usableNetworkInterfaces,
            interfaceOptions: usableNetworkInterfaces.map(toNetworkInterfaceOption),
        };
    }

    private logNetworkInterfaceRefreshFailure(
        result: RefreshableCacheReadResult<CachedNetworkInterfaces>,
        retryMilliseconds: number,
    ): void {
        networkLog.atWarn()
            .everyMs(
                "network-interface-refresh-failed",
                NodeSystemSource.NETWORK_INTERFACE_STALE_WARNING_INTERVAL_MS,
            )
            .log(() => [
                formatNetworkInterfaceRefreshFailureMessage(result),
                `cacheAgeMs=${result.ageMilliseconds ?? "none"}`,
                `maxStaleMs=${NodeSystemSource.NETWORK_INTERFACE_STALE_MAX_MS}`,
                `retryMs=${retryMilliseconds}`,
                `error=${String(result.error)}`,
            ].join(" "));
    }

    private calculateNetworkRate(options: {
        interfaceId: string;
        direction: NetworkMetricDirection;
        currentBytes: number;
        currentMonotonicMilliseconds: number;
    }): NodeSystemNetworkRateCalculation {
        const sampleKey = `${options.interfaceId}:${options.direction}`;
        const previousSample = this.lastNetworkStatsByInterface.get(sampleKey);
        this.lastNetworkStatsByInterface.set(sampleKey, {
            bytes: options.currentBytes,
            monotonicMilliseconds: options.currentMonotonicMilliseconds,
        });

        return calculateNetworkRate({
            ...options,
            previousSample,
        });
    }

    private logNetworkPollDebug(options: {
        networkInterfaces: readonly Systeminformation.NetworkInterfacesData[];
        interfaceOptions: readonly NetworkInterfaceOption[];
        networkStats: readonly Systeminformation.NetworkStatsData[];
        rateCalculations: readonly NodeSystemNetworkRateCalculation[];
        aggregateDownloadBytesPerSecond: number;
        aggregateUploadBytesPerSecond: number;
        currentMonotonicMilliseconds: number;
    }): void {
        const hasPreviousSample = options.rateCalculations.some(rateCalculation => rateCalculation.hadPreviousSample);
        const hasUsableInterfaces = options.interfaceOptions.length > 0;
        const hasStats = options.networkStats.length > 0;
        const isAggregateZero = options.aggregateDownloadBytesPerSecond === 0 && options.aggregateUploadBytesPerSecond === 0;
        const shouldLogPeriodic = options.currentMonotonicMilliseconds - this.lastNetworkPollDebugLogMonotonicMilliseconds
            >= NodeSystemSource.NETWORK_DEBUG_LOG_INTERVAL_MS;
        const shouldLogSuspiciousZero = hasUsableInterfaces && hasStats && hasPreviousSample && isAggregateZero;

        if (!shouldLogPeriodic && !shouldLogSuspiciousZero) {
            return;
        }

        this.lastNetworkPollDebugLogMonotonicMilliseconds = options.currentMonotonicMilliseconds;

        networkLog.debug(() => [
            `reason=${shouldLogSuspiciousZero ? "suspicious-zero" : "periodic"}`,
            `usable=${JSON.stringify(options.interfaceOptions.map(formatNetworkInterfaceOptionDebug))}`,
            `stats=${JSON.stringify(options.networkStats.map(formatNetworkStatDebug))}`,
            `rates=${JSON.stringify(options.rateCalculations.map(formatNetworkRateCalculationDebug))}`,
            `aggregateDown=${options.aggregateDownloadBytesPerSecond.toFixed(0)}`,
            `aggregateUp=${options.aggregateUploadBytesPerSecond.toFixed(0)}`,
            `rawInterfaces=${JSON.stringify(options.networkInterfaces.map(formatRawNetworkInterfaceDebug))}`,
        ].join(" "));
    }

    private async pollGpu(): Promise<NodeSystemGpuTelemetryData | null> {
        const pollSequence = reserveNodeSystemGpuPollDebugSequence();
        const pollStartedAtMonotonicMilliseconds = this.monotonicNow();
        gpuLog.debug(() => [
            "sourceStart",
            `pollId=${pollSequence}`,
            `activeNvidiaSmiQueries=${getActiveNvidiaSmiQueryCount()}`,
        ].join(" "));

        const gpuData = await this.readGpuTelemetry();

        if (gpuData) {
            gpuLog.debug(() => [
                "sourceSuccess",
                `pollId=${pollSequence}`,
                `elapsedMs=${this.monotonicNow() - pollStartedAtMonotonicMilliseconds}`,
            ].join(" "));
            return gpuData;
        }

        gpuLog.debug(() => [
            "sourceNoData",
            `pollId=${pollSequence}`,
            `elapsedMs=${this.monotonicNow() - pollStartedAtMonotonicMilliseconds}`,
        ].join(" "));
        return null;
    }

    private async readGpuTelemetry(): Promise<NodeSystemGpuTelemetryData | null> {
        const currentMonotonicMilliseconds = this.monotonicNow();

        if (this.cachedGpuData && (currentMonotonicMilliseconds - this.cachedGpuMonotonicMilliseconds) < NodeSystemSource.GPU_CACHE_MS) {
            gpuLog.debug(() => [
                "cacheHit",
                `cacheAgeMs=${currentMonotonicMilliseconds - this.cachedGpuMonotonicMilliseconds}`,
            ].join(" "));
            return this.cachedGpuData;
        }

        if (this.pendingGpuPromise) {
            gpuLog.debug("pendingReuse");
            return this.pendingGpuPromise;
        }

        this.pendingGpuPromise = (async () => {
            try {
                const gpuData = await this.pollPlatformGpuTelemetry();

                if (gpuData) {
                    this.cachedGpuData = gpuData;
                    this.cachedGpuMonotonicMilliseconds = this.monotonicNow();
                    return gpuData;
                }

                return null;
            } catch (error) {
                gpuLog.error(() => `GPU poll error: ${String(error)}`);
                return null;
            } finally {
                this.pendingGpuPromise = null;
            }
        })();

        return this.pendingGpuPromise;
    }

    private async pollPlatformGpuTelemetry(): Promise<NodeSystemGpuTelemetryData | null> {
        if (this.platform === "win32") {
            return await this.pollWindowsGpuTelemetry();
        }

        if (this.platform === "darwin") {
            return await this.pollDarwinGpuTelemetry();
        }

        return await this.pollSystemInformationGpuTelemetry(this.systemInformation);
    }
}

export function resolveCollectorGroups(metricKeys: readonly string[]): Set<NodeSystemMetricGroup> {
    if (metricKeys.length === 0) {
        return new Set(["cpu", "memory", "disk", "network", "gpu"]);
    }

    const metricGroups = new Set<NodeSystemMetricGroup>();

    for (const metricKey of metricKeys) {
        const metricGroup = resolveNodeSystemMetricGroup(metricKey);
        if (metricGroup) {
            metricGroups.add(metricGroup);
        }
    }

    return metricGroups;
}

export function resolveNodeSystemMetricGroup(metricKey: string): NodeSystemMetricGroup | undefined {
    if (isCpuMetricKey(metricKey)) {
        return "cpu";
    }

    if (isNetworkMetricKey(metricKey)) {
        return "network";
    }

    if (isRamMetricKey(metricKey)) {
        return "memory";
    }

    if (isDiskMetricKey(metricKey)) {
        return "disk";
    }

    if (isGpuMetricKey(metricKey)) {
        return "gpu";
    }

    return undefined;
}

function resolveRamUsedBytes(memoryData: Systeminformation.MemData, platform: NodeJS.Platform): number {
    // On macOS, systeminformation v5 derives available from active pages and can
    // treat Cached Files as unavailable. Subtract reclaimable memory instead,
    // matching Activity Monitor's Memory Used more closely. Linux/Windows
    // available is the platform-level reclaimable-aware value.
    if (platform === "darwin") {
        return Number.isFinite(memoryData.reclaimable) && memoryData.reclaimable >= 0
            ? Math.max(memoryData.used - memoryData.reclaimable, 0)
            : memoryData.used;
    }

    if (Number.isFinite(memoryData.available)
        && memoryData.available >= 0
        && memoryData.available <= memoryData.total) {
        return memoryData.total - memoryData.available;
    }

    return memoryData.used;
}

function formatNetworkInterfaceRefreshFailureMessage(
    result: RefreshableCacheReadResult<CachedNetworkInterfaces>,
): string {
    if (result.state === "stale") {
        return "Network interface refresh failed; using stale interfaces";
    }

    return result.storedAtMonotonicMilliseconds == null
        ? "Network interface refresh failed; no cached interfaces"
        : "Network interface refresh failed; stale interfaces expired";
}

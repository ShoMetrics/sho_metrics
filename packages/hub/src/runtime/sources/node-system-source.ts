import si, { type Systeminformation } from "systeminformation";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    buildTextMetricValue,
    MetricUnit,
    type MetricSource,
    type MetricSnapshot,
    type MetricValue,
} from "./metric-source";
import { logger } from "../../logging/logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    isNetworkMetricKey,
    type NetworkMetricDirection,
} from "../network-metric-keys";
import { diskVolumeRegistry, type DiskVolumeOption } from "../disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
    isDiskMetricKey,
    isDiskThroughputMetricKey,
    isDiskUsageMetricKey,
} from "../disk-metric-keys";
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
} from "../metric-keys";
import { formatCpuModelText, isFinitePositiveNumber } from "./node-system-cpu";
import {
    calculatePercent,
    isUsableFileSystem,
    normalizeNullableRate,
    resolveDefaultDiskVolume,
    toDiskVolumeOption,
} from "./node-system-disk";
import {
    getActiveNvidiaSmiQueryCount,
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
import { NODE_SYSTEM_SOURCE_ID } from "./source-ids";

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
    now?: () => number;
    pollWindowsGpuTelemetry?: () => Promise<NodeSystemGpuTelemetryData | null>;
    pollSystemInformationGpuTelemetry?: (
        systemInformation: NodeSystemInformationClient,
    ) => Promise<NodeSystemGpuTelemetryData | null>;
}

interface CachedNetworkInterfaces {
    readonly rawNetworkInterfaces: readonly Systeminformation.NetworkInterfacesData[];
    readonly interfaceOptions: readonly NetworkInterfaceOption[];
    readonly timestampMilliseconds: number;
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
    private readonly now: () => number;
    private readonly pollWindowsGpuTelemetry: () => Promise<NodeSystemGpuTelemetryData | null>;
    private readonly pollSystemInformationGpuTelemetry: (
        systemInformation: NodeSystemInformationClient,
    ) => Promise<NodeSystemGpuTelemetryData | null>;
    private lastNetworkStatsByInterface = new Map<string, NodeSystemNetworkCounterSample>();
    private cachedNetworkInterfaces: CachedNetworkInterfaces | null = null;
    // Coalesces overlapping collector ticks if runtime polling becomes source/collector independent.
    private pendingNetworkInterfacesPromise: Promise<CachedNetworkInterfaces> | null = null;
    private nextNetworkInterfaceRefreshAllowedTimestampMilliseconds = 0;
    private lastNetworkInterfaceStaleWarningTimestampMilliseconds = 0;
    private lastNetworkPollDebugLogTimestampMilliseconds = 0;
    private cachedGpuData: NodeSystemGpuTelemetryData | null = null;
    private cachedGpuTimestampMilliseconds = 0;
    private pendingGpuPromise: Promise<NodeSystemGpuTelemetryData | null> | null = null;
    private cachedCpuBaseFrequencyGigahertz: number | null = null;
    private cachedCpuModelText: string | null = null;
    private pendingCpuInformationPromise: Promise<void> | null = null;
    private hasAttemptedCpuInformationPoll = false;
    private gpuConsecutiveTimeouts = 0;
    private nextGpuPollAllowedTimestampMilliseconds = 0;
    private lastGpuTimeoutWarningTimestampMilliseconds = 0;

    private static readonly GPU_CACHE_MS = 1000;
    private static readonly GPU_POLL_TIMEOUT_MS = 3300;
    // Interface topology is semi-static. Cache discovery for 10s to keep networkInterfaces()
    // out of the 1Hz hot path while bounding Wi-Fi/VPN/USB adapter hot-plug staleness.
    private static readonly NETWORK_INTERFACE_CACHE_MS = 10000;
    // Empty discovery often means startup or reconnect transition; retry quickly so N/A
    // does not stick for a full topology cache window.
    private static readonly EMPTY_NETWORK_INTERFACE_CACHE_MS = 2000;
    // When discovery fails, stale last-good interfaces are safer than a 1Hz N/A flicker,
    // but retry throttling prevents a failing OS query loop from becoming the hot path.
    private static readonly NETWORK_INTERFACE_REFRESH_RETRY_MS = 2000;
    private static readonly NETWORK_INTERFACE_STALE_WARNING_INTERVAL_MS = 30000;
    private static readonly NETWORK_DEBUG_LOG_INTERVAL_MS = 5000;
    private static readonly GPU_TIMEOUT_WARNING_INTERVAL_MS = 10000;
    private static readonly GPU_BACKOFF_STEPS_MS = [2000, 5000, 10000, 30000] as const;

    constructor(dependencies: NodeSystemSourceDependencies = {}) {
        this.systemInformation = dependencies.systemInformation ?? defaultSystemInformation;
        this.networkRegistry = dependencies.networkRegistry ?? networkInterfaceRegistry;
        this.diskRegistry = dependencies.diskRegistry ?? diskVolumeRegistry;
        this.platform = dependencies.platform ?? process.platform;
        this.now = dependencies.now ?? Date.now;
        this.pollWindowsGpuTelemetry = dependencies.pollWindowsGpuTelemetry ?? pollWindowsNvidiaGpuTelemetry;
        this.pollSystemInformationGpuTelemetry = dependencies.pollSystemInformationGpuTelemetry
            ?? pollSystemInformationGpuTelemetry;
    }

    async poll(): Promise<MetricSnapshot> {
        return this.pollMetrics([]);
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<MetricSnapshot> {
        const metrics: Record<string, MetricValue> = {};
        const metricGroups = resolveMetricGroups(metricKeys);
        const pollStartTimestampMilliseconds = this.now();

        const [cpuMetrics, memoryMetrics, diskMetrics, networkMetrics, gpu] = await Promise.all([
            metricGroups.has("cpu") ? this.pollCpu() : Promise.resolve({}),
            metricGroups.has("memory") ? this.pollMemory() : Promise.resolve({}),
            metricGroups.has("disk") ? this.pollDiskSafely(metricKeys) : Promise.resolve({}),
            metricGroups.has("network") ? this.pollNetworkSafely() : Promise.resolve({}),
            metricGroups.has("gpu") ? this.pollGpuWithTimeout() : Promise.resolve(null),
        ]);

        Object.assign(metrics, cpuMetrics, memoryMetrics, diskMetrics, networkMetrics);

        if (gpu) {
            metrics[GPU_USAGE_METRIC_KEY] = buildScalarMetricValue(gpu.utilizationGpu ?? 0, {
                unit: MetricUnit.PERCENT,
            });
            if (gpu.modelText) {
                metrics[GPU_MODEL_METRIC_KEY] = buildTextMetricValue(gpu.modelText);
            }
            metrics[GPU_TEMP_METRIC_KEY] = buildScalarMetricValue(gpu.temperatureGpu ?? 0, { unit: MetricUnit.CELSIUS });
            metrics[GPU_VRAM_USED_METRIC_KEY] = buildScalarMetricValue(
                (gpu.memoryUsed ?? 0) * BYTES_PER_MEBIBYTE,
                { unit: MetricUnit.BYTES },
            );
            metrics[GPU_VRAM_TOTAL_METRIC_KEY] = buildScalarMetricValue(
                (gpu.memoryTotal ?? 0) * BYTES_PER_MEBIBYTE,
                { unit: MetricUnit.BYTES },
            );
            if (typeof gpu.powerDraw === "number" && Number.isFinite(gpu.powerDraw)) {
                metrics[GPU_POWER_METRIC_KEY] = buildScalarMetricValue(gpu.powerDraw, { unit: MetricUnit.WATTS });
            }
            if (typeof gpu.powerLimit === "number" && Number.isFinite(gpu.powerLimit)) {
                metrics[GPU_POWER_LIMIT_METRIC_KEY] = buildScalarMetricValue(gpu.powerLimit, { unit: MetricUnit.WATTS });
            }
        }

        return buildMetricSnapshot({
            timestampMilliseconds: pollStartTimestampMilliseconds,
            metrics,
        });
    }

    private async pollMemory(): Promise<Record<string, MetricValue>> {
        try {
            const memoryData = await this.systemInformation.mem();

            return {
                [RAM_USED_METRIC_KEY]: buildScalarMetricValue(memoryData.used, { unit: MetricUnit.BYTES }),
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
        const diskVolumes = fileSystems
            .filter(isUsableFileSystem)
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

            if (this.cachedCpuBaseFrequencyGigahertz != null) {
                metrics[CPU_BASE_FREQUENCY_METRIC_KEY] = buildScalarMetricValue(
                    this.cachedCpuBaseFrequencyGigahertz * HERTZ_PER_GIGAHERTZ,
                    { unit: MetricUnit.HERTZ },
                );
            }
            if (this.cachedCpuModelText) {
                metrics[CPU_MODEL_METRIC_KEY] = buildTextMetricValue(this.cachedCpuModelText);
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
            this.hasAttemptedCpuInformationPoll
            || this.pendingCpuInformationPromise
        ) {
            return;
        }

        this.hasAttemptedCpuInformationPoll = true;
        this.pendingCpuInformationPromise = this.systemInformation.cpu()
            .then(cpuData => {
                if (isFinitePositiveNumber(cpuData.speed)) {
                    this.cachedCpuBaseFrequencyGigahertz = cpuData.speed;
                }
                this.cachedCpuModelText = formatCpuModelText(cpuData);
            })
            .catch(error => {
                log.warn(() => `CPU information poll error: ${String(error)}`);
            })
            .finally(() => {
                this.pendingCpuInformationPromise = null;
            });
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
        const interfaceOptions = cachedNetworkInterfaces.interfaceOptions;
        const usableInterfaceIds = new Set(interfaceOptions.map((networkInterface) => networkInterface.id));
        const networkStats = usableInterfaceIds.size > 0
            ? await this.systemInformation.networkStats([...usableInterfaceIds].join(","))
            : [];
        const currentTimestampMilliseconds = this.now();
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
                currentTimestampMilliseconds,
            });
            const uploadRate = this.calculateNetworkRate({
                interfaceId: networkStat.iface,
                direction: "upload",
                currentBytes: networkStat.tx_bytes,
                currentTimestampMilliseconds,
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
            currentTimestampMilliseconds,
        });

        return metrics;
    }

    private async readUsableNetworkInterfaces(): Promise<CachedNetworkInterfaces> {
        const currentTimestampMilliseconds = this.now();

        if (this.cachedNetworkInterfaces && !this.isNetworkInterfaceCacheExpired(currentTimestampMilliseconds)) {
            return this.cachedNetworkInterfaces;
        }

        if (
            this.cachedNetworkInterfaces
            && currentTimestampMilliseconds < this.nextNetworkInterfaceRefreshAllowedTimestampMilliseconds
        ) {
            return this.cachedNetworkInterfaces;
        }

        if (this.pendingNetworkInterfacesPromise) {
            return this.pendingNetworkInterfacesPromise;
        }

        this.pendingNetworkInterfacesPromise = this.refreshUsableNetworkInterfaces(currentTimestampMilliseconds)
            .catch(error => this.handleNetworkInterfaceRefreshError(error, currentTimestampMilliseconds))
            .finally(() => {
                this.pendingNetworkInterfacesPromise = null;
            });

        return this.pendingNetworkInterfacesPromise;
    }

    private isNetworkInterfaceCacheExpired(currentTimestampMilliseconds: number): boolean {
        if (!this.cachedNetworkInterfaces) {
            return true;
        }

        const cacheAgeMilliseconds = currentTimestampMilliseconds - this.cachedNetworkInterfaces.timestampMilliseconds;
        const cacheDurationMilliseconds = this.cachedNetworkInterfaces.interfaceOptions.length > 0
            ? NodeSystemSource.NETWORK_INTERFACE_CACHE_MS
            : NodeSystemSource.EMPTY_NETWORK_INTERFACE_CACHE_MS;

        return cacheAgeMilliseconds >= cacheDurationMilliseconds;
    }

    private async refreshUsableNetworkInterfaces(
        currentTimestampMilliseconds: number,
    ): Promise<CachedNetworkInterfaces> {
        const networkInterfaces = await this.systemInformation.networkInterfaces();
        const usableNetworkInterfaces = Array.isArray(networkInterfaces)
            ? networkInterfaces.filter(networkInterface => isUsableNetworkInterface(networkInterface, this.platform))
            : [];
        const cachedNetworkInterfaces: CachedNetworkInterfaces = {
            rawNetworkInterfaces: usableNetworkInterfaces,
            interfaceOptions: usableNetworkInterfaces.map(toNetworkInterfaceOption),
            timestampMilliseconds: currentTimestampMilliseconds,
        };

        this.cachedNetworkInterfaces = cachedNetworkInterfaces;
        this.nextNetworkInterfaceRefreshAllowedTimestampMilliseconds = 0;
        return cachedNetworkInterfaces;
    }

    private handleNetworkInterfaceRefreshError(
        error: unknown,
        currentTimestampMilliseconds: number,
    ): CachedNetworkInterfaces {
        if (!this.cachedNetworkInterfaces) {
            throw error;
        }

        this.nextNetworkInterfaceRefreshAllowedTimestampMilliseconds = currentTimestampMilliseconds
            + NodeSystemSource.NETWORK_INTERFACE_REFRESH_RETRY_MS;

        if (this.shouldLogNetworkInterfaceStaleWarning(currentTimestampMilliseconds)) {
            const cacheAgeMilliseconds = currentTimestampMilliseconds
                - this.cachedNetworkInterfaces.timestampMilliseconds;
            this.lastNetworkInterfaceStaleWarningTimestampMilliseconds = currentTimestampMilliseconds;

            networkLog.warn(() => [
                "Network interface refresh failed; using stale interfaces",
                `cacheAgeMs=${cacheAgeMilliseconds}`,
                `retryMs=${NodeSystemSource.NETWORK_INTERFACE_REFRESH_RETRY_MS}`,
                `error=${String(error)}`,
            ].join(" "));
        }

        return this.cachedNetworkInterfaces;
    }

    private shouldLogNetworkInterfaceStaleWarning(currentTimestampMilliseconds: number): boolean {
        return this.lastNetworkInterfaceStaleWarningTimestampMilliseconds === 0
            || currentTimestampMilliseconds - this.lastNetworkInterfaceStaleWarningTimestampMilliseconds
                >= NodeSystemSource.NETWORK_INTERFACE_STALE_WARNING_INTERVAL_MS;
    }

    private calculateNetworkRate(options: {
        interfaceId: string;
        direction: NetworkMetricDirection;
        currentBytes: number;
        currentTimestampMilliseconds: number;
    }): NodeSystemNetworkRateCalculation {
        const sampleKey = `${options.interfaceId}:${options.direction}`;
        const previousSample = this.lastNetworkStatsByInterface.get(sampleKey);
        this.lastNetworkStatsByInterface.set(sampleKey, {
            bytes: options.currentBytes,
            timestampMilliseconds: options.currentTimestampMilliseconds,
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
        currentTimestampMilliseconds: number;
    }): void {
        const hasPreviousSample = options.rateCalculations.some(rateCalculation => rateCalculation.hadPreviousSample);
        const hasUsableInterfaces = options.interfaceOptions.length > 0;
        const hasStats = options.networkStats.length > 0;
        const isAggregateZero = options.aggregateDownloadBytesPerSecond === 0 && options.aggregateUploadBytesPerSecond === 0;
        const shouldLogPeriodic = options.currentTimestampMilliseconds - this.lastNetworkPollDebugLogTimestampMilliseconds
            >= NodeSystemSource.NETWORK_DEBUG_LOG_INTERVAL_MS;
        const shouldLogSuspiciousZero = hasUsableInterfaces && hasStats && hasPreviousSample && isAggregateZero;

        if (!shouldLogPeriodic && !shouldLogSuspiciousZero) {
            return;
        }

        this.lastNetworkPollDebugLogTimestampMilliseconds = options.currentTimestampMilliseconds;

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
        const currentTimestampMilliseconds = this.now();

        if (this.cachedGpuData && (currentTimestampMilliseconds - this.cachedGpuTimestampMilliseconds) < NodeSystemSource.GPU_CACHE_MS) {
            gpuLog.debug(() => [
                "cacheHit",
                `cacheAgeMs=${currentTimestampMilliseconds - this.cachedGpuTimestampMilliseconds}`,
            ].join(" "));
            return this.cachedGpuData;
        }

        if (this.pendingGpuPromise) {
            gpuLog.debug("pendingReuse");
            return this.pendingGpuPromise;
        }

        this.pendingGpuPromise = (async () => {
            try {
                const gpuData = this.platform === "win32"
                    ? await this.pollWindowsGpuTelemetry()
                    : await this.pollSystemInformationGpuTelemetry(this.systemInformation);

                if (gpuData) {
                    this.cachedGpuData = gpuData;
                    this.cachedGpuTimestampMilliseconds = this.now();
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

    private async pollGpuWithTimeout(): Promise<NodeSystemGpuTelemetryData | null> {
        const currentTimestampMilliseconds = this.now();

        if (currentTimestampMilliseconds < this.nextGpuPollAllowedTimestampMilliseconds) {
            gpuLog.debug(() => [
                "skippedBackoff",
                `remainingMs=${this.nextGpuPollAllowedTimestampMilliseconds - currentTimestampMilliseconds}`,
                `timeoutCount=${this.gpuConsecutiveTimeouts}`,
            ].join(" "));
            return null;
        }

        const pollSequence = reserveNodeSystemGpuPollDebugSequence();
        const pollStartTimestampMilliseconds = this.now();
        gpuLog.debug(() => [
            "sourceStart",
            `pollId=${pollSequence}`,
            `timeoutMs=${NodeSystemSource.GPU_POLL_TIMEOUT_MS}`,
            `activeNvidiaSmiQueries=${getActiveNvidiaSmiQueryCount()}`,
        ].join(" "));

        let timeoutId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<NodeSystemGpuTelemetryData | null>((resolve) => {
            timeoutId = setTimeout(() => {
                const elapsedMilliseconds = this.now() - pollStartTimestampMilliseconds;
                gpuLog.debug(() => [
                    "sourceTimeout",
                    `pollId=${pollSequence}`,
                    `elapsedMs=${elapsedMilliseconds}`,
                    `timeoutMs=${NodeSystemSource.GPU_POLL_TIMEOUT_MS}`,
                    `timerDelayMs=${Math.max(0, elapsedMilliseconds - NodeSystemSource.GPU_POLL_TIMEOUT_MS)}`,
                    `activeNvidiaSmiQueries=${getActiveNvidiaSmiQueryCount()}`,
                ].join(" "));
                this.recordGpuPollTimeout();
                resolve(null);
            }, NodeSystemSource.GPU_POLL_TIMEOUT_MS);
        });

        const gpuData = await Promise.race([this.pollGpu(), timeoutPromise]);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (gpuData && this.now() < this.nextGpuPollAllowedTimestampMilliseconds) {
            return gpuData;
        }

        if (gpuData) {
            this.gpuConsecutiveTimeouts = 0;
            this.nextGpuPollAllowedTimestampMilliseconds = 0;
            gpuLog.debug(() => [
                "sourceSuccess",
                `pollId=${pollSequence}`,
                `elapsedMs=${this.now() - pollStartTimestampMilliseconds}`,
            ].join(" "));
            return gpuData;
        }

        gpuLog.debug(() => [
            "sourceNoData",
            `pollId=${pollSequence}`,
            `elapsedMs=${this.now() - pollStartTimestampMilliseconds}`,
        ].join(" "));
        return null;
    }

    private recordGpuPollTimeout(): void {
        const currentTimestampMilliseconds = this.now();
        const backoffIndex = Math.min(
            this.gpuConsecutiveTimeouts,
            NodeSystemSource.GPU_BACKOFF_STEPS_MS.length - 1,
        );
        const backoffMilliseconds = NodeSystemSource.GPU_BACKOFF_STEPS_MS[backoffIndex];

        this.gpuConsecutiveTimeouts += 1;
        this.nextGpuPollAllowedTimestampMilliseconds = currentTimestampMilliseconds + backoffMilliseconds;

        if (
            currentTimestampMilliseconds - this.lastGpuTimeoutWarningTimestampMilliseconds
            < NodeSystemSource.GPU_TIMEOUT_WARNING_INTERVAL_MS
        ) {
            return;
        }

        this.lastGpuTimeoutWarningTimestampMilliseconds = currentTimestampMilliseconds;
        gpuLog.warn(() => [
            "GPU poll exceeded timeout; suppressing stale GPU metrics",
            `timeoutMs=${NodeSystemSource.GPU_POLL_TIMEOUT_MS}`,
            `timeoutCount=${this.gpuConsecutiveTimeouts}`,
            `backoffMs=${backoffMilliseconds}`,
        ].join(" "));
    }
}

export function resolveMetricGroups(metricKeys: readonly string[]): Set<NodeSystemMetricGroup> {
    if (metricKeys.length === 0) {
        return new Set(["cpu", "memory", "disk", "network", "gpu"]);
    }

    const metricGroups = new Set<NodeSystemMetricGroup>();

    for (const metricKey of metricKeys) {
        if (isCpuMetricKey(metricKey)) {
            metricGroups.add("cpu");
            continue;
        }

        if (isNetworkMetricKey(metricKey)) {
            metricGroups.add("network");
            continue;
        }

        if (isRamMetricKey(metricKey)) {
            metricGroups.add("memory");
            continue;
        }

        if (isDiskMetricKey(metricKey)) {
            metricGroups.add("disk");
            continue;
        }

        if (isGpuMetricKey(metricKey)) {
            metricGroups.add("gpu");
        }
    }

    return metricGroups;
}

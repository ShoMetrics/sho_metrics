import si, { type Systeminformation } from "systeminformation";
import type { IMetricSource, IMetricSnapshot, IMetricValue } from "./source.interface";
import { logger } from "../../logging/logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../network-metric-keys";
import { diskVolumeRegistry, type DiskVolumeOption } from "../disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../disk-metric-keys";
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

const log = logger.for("Source:NodeSystem");
const networkLog = logger.for("Source:NodeSystem:Network");
const gpuLog = logger.for("Source:NodeSystem:GPU");

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

export interface NodeSystemSourceDependencies {
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

/**
 * Node.js runtime metric source backed by `systeminformation` and OS command helpers.
 */
export class NodeSystemSource implements IMetricSource {
    readonly sourceId = "node-system";

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

    async poll(): Promise<IMetricSnapshot> {
        return this.pollMetrics([]);
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        const metrics: Record<string, IMetricValue> = {};
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
            metrics["gpu.usage_percent"] = {
                scalar: gpu.utilizationGpu ?? 0,
                unit: "%",
                progress: Math.min(Math.max((gpu.utilizationGpu ?? 0) / 100, 0), 1),
            };
            if (gpu.modelText) {
                metrics["gpu.model"] = {
                    text: gpu.modelText,
                };
            }
            metrics["gpu.temp"] = {
                scalar: gpu.temperatureGpu ?? 0,
                unit: "°C",
            };
            metrics["gpu.vram_used"] = {
                scalar: gpu.memoryUsed ?? 0,
                unit: "MB",
            };
            metrics["gpu.vram_total"] = {
                scalar: gpu.memoryTotal ?? 0,
                unit: "MB",
            };
            if (typeof gpu.powerDraw === "number" && Number.isFinite(gpu.powerDraw)) {
                metrics["gpu.power"] = {
                    scalar: gpu.powerDraw,
                    unit: "W",
                };
            }
            if (typeof gpu.powerLimit === "number" && Number.isFinite(gpu.powerLimit)) {
                metrics["gpu.power_limit"] = {
                    scalar: gpu.powerLimit,
                    unit: "W",
                };
            }
        }

        return {
            sourceId: this.sourceId,
            timestampMs: pollStartTimestampMilliseconds,
            metrics,
        };
    }

    private async pollMemory(): Promise<Record<string, IMetricValue>> {
        try {
            const memoryData = await this.systemInformation.mem();

            return {
                "ram.used": {
                    scalar: memoryData.used,
                    unit: "B",
                },
                "ram.total": {
                    scalar: memoryData.total,
                    unit: "B",
                },
            };
        } catch (error) {
            log.error(() => `Memory poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollDiskSafely(metricKeys: readonly string[]): Promise<Record<string, IMetricValue>> {
        try {
            return await this.pollDisk(metricKeys);
        } catch (error) {
            log.error(() => `Disk poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollDisk(metricKeys: readonly string[]): Promise<Record<string, IMetricValue>> {
        const metrics: Record<string, IMetricValue> = {};
        const shouldPollUsage = metricKeys.length === 0 || metricKeys.some(metricKey =>
            metricKey.startsWith("disk.usage.") || metricKey.startsWith("disk.volume."),
        );
        const shouldPollThroughput = metricKeys.length === 0 || metricKeys.some(metricKey =>
            metricKey.startsWith("disk.throughput."),
        );

        if (shouldPollUsage) {
            Object.assign(metrics, await this.pollDiskUsage());
        }

        if (shouldPollThroughput && this.platform === "darwin") {
            Object.assign(metrics, await this.pollDiskThroughput());
        }

        return metrics;
    }

    private async pollDiskUsage(): Promise<Record<string, IMetricValue>> {
        const metrics: Record<string, IMetricValue> = {};
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
            metrics[getDiskVolumeMetricKey("used", diskVolume.id)] = { scalar: diskVolume.usedBytes, unit: "B" };
            metrics[getDiskVolumeMetricKey("total", diskVolume.id)] = { scalar: diskVolume.sizeBytes, unit: "B" };
            metrics[getDiskVolumeMetricKey("available", diskVolume.id)] = { scalar: diskVolume.availableBytes, unit: "B" };
            metrics[getDiskVolumeMetricKey("percent", diskVolume.id)] = {
                scalar: calculatePercent(diskVolume.usedBytes, diskVolume.sizeBytes),
                unit: "%",
            };
        }

        if (defaultDiskVolume) {
            metrics[getDefaultDiskUsageMetricKey("used")] = { scalar: defaultDiskVolume.usedBytes, unit: "B" };
            metrics[getDefaultDiskUsageMetricKey("total")] = { scalar: defaultDiskVolume.sizeBytes, unit: "B" };
            metrics[getDefaultDiskUsageMetricKey("available")] = { scalar: defaultDiskVolume.availableBytes, unit: "B" };
            metrics[getDefaultDiskUsageMetricKey("percent")] = {
                scalar: calculatePercent(defaultDiskVolume.usedBytes, defaultDiskVolume.sizeBytes),
                unit: "%",
            };
        }

        return metrics;
    }

    private async pollDiskThroughput(): Promise<Record<string, IMetricValue>> {
        const fileSystemStats = await this.systemInformation.fsStats();

        return {
            [getDiskThroughputMetricKey("read")]: {
                scalar: normalizeNullableRate(fileSystemStats.rx_sec),
                unit: "B/s",
            },
            [getDiskThroughputMetricKey("write")]: {
                scalar: normalizeNullableRate(fileSystemStats.wx_sec),
                unit: "B/s",
            },
            [getDiskThroughputMetricKey("total")]: {
                scalar: normalizeNullableRate(fileSystemStats.tx_sec),
                unit: "B/s",
            },
        };
    }

    private async pollCpu(): Promise<Record<string, IMetricValue>> {
        try {
            const load = await this.systemInformation.currentLoad();
            const metrics: Record<string, IMetricValue> = {
                "cpu.usage_percent": {
                    scalar: load.currentLoad,
                    unit: "%",
                    progress: Math.min(Math.max(load.currentLoad / 100, 0), 1),
                },
            };

            if (this.cachedCpuBaseFrequencyGigahertz != null) {
                metrics["cpu.base_frequency"] = {
                    scalar: this.cachedCpuBaseFrequencyGigahertz,
                    unit: "GHz",
                };
            }
            if (this.cachedCpuModelText) {
                metrics["cpu.model"] = {
                    text: this.cachedCpuModelText,
                };
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

    private async pollNetworkSafely(): Promise<Record<string, IMetricValue>> {
        try {
            return await this.pollNetwork();
        } catch (error) {
            networkLog.error(() => `Network poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollNetwork(): Promise<Record<string, IMetricValue>> {
        const metrics: Record<string, IMetricValue> = {};
        const networkInterfaces = await this.systemInformation.networkInterfaces();
        const usableNetworkInterfaces = Array.isArray(networkInterfaces)
            ? networkInterfaces.filter(networkInterface => isUsableNetworkInterface(networkInterface, this.platform))
            : [];
        const interfaceOptions = usableNetworkInterfaces.map(toNetworkInterfaceOption);
        const usableInterfaceIds = new Set(interfaceOptions.map((networkInterface) => networkInterface.id));
        const networkStats = await this.systemInformation.networkStats("*");
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

            metrics[getNetworkInterfaceMetricKey("download", networkStat.iface)] = {
                scalar: downloadBytesPerSecond,
                unit: "B/s",
            };
            metrics[getNetworkInterfaceMetricKey("upload", networkStat.iface)] = {
                scalar: uploadBytesPerSecond,
                unit: "B/s",
            };

            aggregateDownloadBytesPerSecond += downloadBytesPerSecond;
            aggregateUploadBytesPerSecond += uploadBytesPerSecond;
        }

        metrics[getNetworkAggregateMetricKey("download")] = { scalar: aggregateDownloadBytesPerSecond, unit: "B/s" };
        metrics[getNetworkAggregateMetricKey("upload")] = { scalar: aggregateUploadBytesPerSecond, unit: "B/s" };

        this.logNetworkPollDebug({
            networkInterfaces: usableNetworkInterfaces,
            interfaceOptions,
            networkStats,
            rateCalculations,
            aggregateDownloadBytesPerSecond,
            aggregateUploadBytesPerSecond,
            currentTimestampMilliseconds,
        });

        return metrics;
    }

    private calculateNetworkRate(options: {
        interfaceId: string;
        direction: NetworkDirection;
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
        if (metricKey.startsWith("cpu.")) {
            metricGroups.add("cpu");
            continue;
        }

        if (metricKey.startsWith("net.")) {
            metricGroups.add("network");
            continue;
        }

        if (metricKey.startsWith("ram.")) {
            metricGroups.add("memory");
            continue;
        }

        if (metricKey.startsWith("disk.")) {
            metricGroups.add("disk");
            continue;
        }

        if (metricKey.startsWith("gpu.")) {
            metricGroups.add("gpu");
        }
    }

    return metricGroups;
}

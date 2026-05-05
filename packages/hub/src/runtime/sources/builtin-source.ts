import { execFile, type ExecFileException } from "node:child_process";
import si, { type Systeminformation } from "systeminformation";
import type { IMetricSource, IMetricSnapshot, IMetricValue } from "./source.interface";
import { logger } from "../../logging/logger";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../network-metric-keys";
import { diskVolumeRegistry, type DiskStorageKind, type DiskVolumeOption } from "../disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../disk-metric-keys";

const log = logger.for("Source:Builtin");
const networkLog = logger.for("Source:Builtin:Network");
const gpuLog = logger.for("Source:Builtin:GPU");

type BuiltinSystemInformationClient = Omit<typeof si, "cpuCurrentSpeed">;

const {
    // Do not use. systeminformation v5 documents this as unreliable on Windows
    // and macOS, and it caused multi-second polling stalls here. Use one-shot
    // cpu().speed for static base frequency, or display no frequency.
    cpuCurrentSpeed: blockedCpuCurrentSpeed,
    ...rawSystemInformation
}: typeof si = si;

void blockedCpuCurrentSpeed;

const systemInformation: BuiltinSystemInformationClient = rawSystemInformation;
let lastNvidiaSmiFailureLogTimestampMilliseconds = 0;
let nextGpuPollDebugSequence = 1;
let nextNvidiaSmiQueryDebugSequence = 1;
let activeNvidiaSmiQueryCount = 0;

const NVIDIA_SMI_QUERY_FIELDS = [
    "utilization.gpu",
    "name",
    "temperature.gpu",
    "memory.used",
    "memory.total",
    "power.draw",
    "power.limit",
] as const;

const NVIDIA_SMI_ARGUMENTS = [
    `--query-gpu=${NVIDIA_SMI_QUERY_FIELDS.join(",")}`,
    "--format=csv,noheader,nounits",
] as const;

const NVIDIA_SMI_TIMEOUT_MS = 3000;
const NVIDIA_SMI_FAILURE_LOG_INTERVAL_MS = 30000;

/**
 * Built-in metric source using the `systeminformation` npm package.
 * Provides basic CPU, network, and GPU metrics mapped to the universal protobuf schema.
 */
export class BuiltinSource implements IMetricSource {
    readonly sourceId = "builtin-node";

    private lastNetworkStatsByInterface = new Map<string, NetworkCounterSample>();
    private lastNetworkPollDebugLogTimestampMilliseconds = 0;
    private cachedGpuData: GpuTelemetryData | null = null;
    private cachedGpuTimestampMilliseconds = 0;
    private pendingGpuPromise: Promise<GpuTelemetryData | null> | null = null;
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

    async poll(): Promise<IMetricSnapshot> {
        return this.pollMetrics([]);
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        const metrics: Record<string, IMetricValue> = {};
        const metricGroups = resolveMetricGroups(metricKeys);
        const pollStartTimestampMilliseconds = Date.now();

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
            const memoryData = await systemInformation.mem();

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

        if (shouldPollThroughput && process.platform === "darwin") {
            Object.assign(metrics, await this.pollDiskThroughput());
        }

        return metrics;
    }

    private async pollDiskUsage(): Promise<Record<string, IMetricValue>> {
        const metrics: Record<string, IMetricValue> = {};
        const [fileSystems, blockDevices, diskLayout] = await Promise.all([
            systemInformation.fsSize(),
            systemInformation.blockDevices().catch(error => {
                log.warn(() => `Block device poll error: ${String(error)}`);
                return [] as Systeminformation.BlockDevicesData[];
            }),
            systemInformation.diskLayout().catch(error => {
                log.warn(() => `Disk layout poll error: ${String(error)}`);
                return [] as Systeminformation.DiskLayoutData[];
            }),
        ]);
        const diskVolumes = fileSystems
            .filter(isUsableFileSystem)
            .map(fileSystem => toDiskVolumeOption(fileSystem, blockDevices, diskLayout));
        const defaultDiskVolume = resolveDefaultDiskVolume(diskVolumes);

        diskVolumeRegistry.update(diskVolumes);

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
        const fileSystemStats = await systemInformation.fsStats();

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
            const load = await systemInformation.currentLoad();
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
        this.pendingCpuInformationPromise = systemInformation.cpu()
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
        const networkInterfaces = await systemInformation.networkInterfaces();
        const usableNetworkInterfaces = Array.isArray(networkInterfaces)
            ? networkInterfaces.filter(isUsableNetworkInterface)
            : [];
        const interfaceOptions = usableNetworkInterfaces.map(toNetworkInterfaceOption);
        const usableInterfaceIds = new Set(interfaceOptions.map((networkInterface) => networkInterface.id));
        const networkStats = await systemInformation.networkStats("*");
        const currentTimestampMilliseconds = Date.now();
        let aggregateDownloadBytesPerSecond = 0;
        let aggregateUploadBytesPerSecond = 0;
        const rateCalculations: NetworkRateCalculation[] = [];

        networkInterfaceRegistry.update(interfaceOptions);

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
    }): NetworkRateCalculation {
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
        rateCalculations: readonly NetworkRateCalculation[];
        aggregateDownloadBytesPerSecond: number;
        aggregateUploadBytesPerSecond: number;
        currentTimestampMilliseconds: number;
    }): void {
        const hasPreviousSample = options.rateCalculations.some(rateCalculation => rateCalculation.hadPreviousSample);
        const hasUsableInterfaces = options.interfaceOptions.length > 0;
        const hasStats = options.networkStats.length > 0;
        const isAggregateZero = options.aggregateDownloadBytesPerSecond === 0 && options.aggregateUploadBytesPerSecond === 0;
        const shouldLogPeriodic = options.currentTimestampMilliseconds - this.lastNetworkPollDebugLogTimestampMilliseconds
            >= BuiltinSource.NETWORK_DEBUG_LOG_INTERVAL_MS;
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

    private async pollGpu(): Promise<GpuTelemetryData | null> {
        const currentTimestampMilliseconds = Date.now();

        if (this.cachedGpuData && (currentTimestampMilliseconds - this.cachedGpuTimestampMilliseconds) < BuiltinSource.GPU_CACHE_MS) {
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
                const gpuData = process.platform === "win32"
                    ? await pollWindowsNvidiaGpuTelemetry()
                    : await pollSystemInformationGpuTelemetry();

                if (gpuData) {
                    this.cachedGpuData = gpuData;
                    this.cachedGpuTimestampMilliseconds = Date.now();
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

    private async pollGpuWithTimeout(): Promise<GpuTelemetryData | null> {
        const currentTimestampMilliseconds = Date.now();

        if (currentTimestampMilliseconds < this.nextGpuPollAllowedTimestampMilliseconds) {
            gpuLog.debug(() => [
                "skippedBackoff",
                `remainingMs=${this.nextGpuPollAllowedTimestampMilliseconds - currentTimestampMilliseconds}`,
                `timeoutCount=${this.gpuConsecutiveTimeouts}`,
            ].join(" "));
            return null;
        }

        const pollSequence = nextGpuPollDebugSequence++;
        const pollStartTimestampMilliseconds = Date.now();
        gpuLog.debug(() => [
            "sourceStart",
            `pollId=${pollSequence}`,
            `timeoutMs=${BuiltinSource.GPU_POLL_TIMEOUT_MS}`,
            `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
        ].join(" "));

        let timeoutId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<GpuTelemetryData | null>((resolve) => {
            timeoutId = setTimeout(() => {
                const elapsedMilliseconds = Date.now() - pollStartTimestampMilliseconds;
                gpuLog.debug(() => [
                    "sourceTimeout",
                    `pollId=${pollSequence}`,
                    `elapsedMs=${elapsedMilliseconds}`,
                    `timeoutMs=${BuiltinSource.GPU_POLL_TIMEOUT_MS}`,
                    `timerDelayMs=${Math.max(0, elapsedMilliseconds - BuiltinSource.GPU_POLL_TIMEOUT_MS)}`,
                    `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
                ].join(" "));
                this.recordGpuPollTimeout();
                resolve(null);
            }, BuiltinSource.GPU_POLL_TIMEOUT_MS);
        });

        const gpuData = await Promise.race([this.pollGpu(), timeoutPromise]);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (gpuData && Date.now() < this.nextGpuPollAllowedTimestampMilliseconds) {
            return gpuData;
        }

        if (gpuData) {
            this.gpuConsecutiveTimeouts = 0;
            this.nextGpuPollAllowedTimestampMilliseconds = 0;
            gpuLog.debug(() => [
                "sourceSuccess",
                `pollId=${pollSequence}`,
                `elapsedMs=${Date.now() - pollStartTimestampMilliseconds}`,
            ].join(" "));
            return gpuData;
        }

        gpuLog.debug(() => [
            "sourceNoData",
            `pollId=${pollSequence}`,
            `elapsedMs=${Date.now() - pollStartTimestampMilliseconds}`,
        ].join(" "));
        return null;
    }

    private recordGpuPollTimeout(): void {
        const currentTimestampMilliseconds = Date.now();
        const backoffIndex = Math.min(
            this.gpuConsecutiveTimeouts,
            BuiltinSource.GPU_BACKOFF_STEPS_MS.length - 1,
        );
        const backoffMilliseconds = BuiltinSource.GPU_BACKOFF_STEPS_MS[backoffIndex];

        this.gpuConsecutiveTimeouts += 1;
        this.nextGpuPollAllowedTimestampMilliseconds = currentTimestampMilliseconds + backoffMilliseconds;

        if (
            currentTimestampMilliseconds - this.lastGpuTimeoutWarningTimestampMilliseconds
            < BuiltinSource.GPU_TIMEOUT_WARNING_INTERVAL_MS
        ) {
            return;
        }

        this.lastGpuTimeoutWarningTimestampMilliseconds = currentTimestampMilliseconds;
        gpuLog.warn(() => [
            "GPU poll exceeded timeout; suppressing stale GPU metrics",
            `timeoutMs=${BuiltinSource.GPU_POLL_TIMEOUT_MS}`,
            `timeoutCount=${this.gpuConsecutiveTimeouts}`,
            `backoffMs=${backoffMilliseconds}`,
        ].join(" "));
    }
}

export interface NetworkCounterSample {
    bytes: number;
    timestampMilliseconds: number;
}

export interface GpuTelemetryData {
    utilizationGpu?: number;
    modelText?: string;
    temperatureGpu?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    powerDraw?: number;
    powerLimit?: number;
}

export interface NetworkRateCalculation {
    interfaceId: string;
    direction: NetworkDirection;
    currentBytes: number;
    previousBytes: number | null;
    bytesDelta: number | null;
    elapsedMilliseconds: number | null;
    bytesPerSecond: number;
    hadPreviousSample: boolean;
}

interface NetworkInterfaceOptionDebug {
    id: string;
    name: string;
    type: NetworkInterfaceOption["type"];
    isDefault: boolean;
    speedMegabitsPerSecond: number | null;
}

interface NetworkStatDebug {
    interfaceId: string;
    operstate: string;
    receiveBytes: number;
    receiveBytesPerSecond: number;
    receiveErrors: number;
    receiveDropped: number;
    transmitBytes: number;
    transmitBytesPerSecond: number;
    transmitErrors: number;
    transmitDropped: number;
    sampleMilliseconds: number;
}

interface NetworkRateCalculationDebug {
    interfaceId: string;
    direction: NetworkDirection;
    currentBytes: number;
    previousBytes: number | null;
    bytesDelta: number | null;
    elapsedMilliseconds: number | null;
    computedBytesPerSecond: number;
    hadPreviousSample: boolean;
}

interface RawNetworkInterfaceDebug {
    interfaceId: string;
    name: string;
    type: string;
    operstate: string;
    isDefault: boolean;
    isInternal: boolean;
    isVirtual: boolean;
    speedMegabitsPerSecond: number | null;
}

export function isUsableNetworkInterface(networkInterface: Systeminformation.NetworkInterfacesData): boolean {
    return !networkInterface.internal
        && !networkInterface.virtual
        && networkInterface.operstate === "up"
        && networkInterface.iface.length > 0;
}

export function toNetworkInterfaceOption(networkInterface: Systeminformation.NetworkInterfacesData): NetworkInterfaceOption {
    return {
        id: networkInterface.iface,
        name: networkInterface.ifaceName || networkInterface.iface,
        type: normalizeNetworkInterfaceType(networkInterface.type),
        isDefault: networkInterface.default,
        speedMegabitsPerSecond: typeof networkInterface.speed === "number" && Number.isFinite(networkInterface.speed)
            ? networkInterface.speed
            : null,
    };
}

export function normalizeNetworkInterfaceType(type: string): NetworkInterfaceOption["type"] {
    if (type === "wired" || type === "wireless") {
        return type;
    }

    return "unknown";
}

function formatNetworkInterfaceOptionDebug(networkInterface: NetworkInterfaceOption): NetworkInterfaceOptionDebug {
    return {
        id: networkInterface.id,
        name: networkInterface.name,
        type: networkInterface.type,
        isDefault: networkInterface.isDefault,
        speedMegabitsPerSecond: networkInterface.speedMegabitsPerSecond,
    };
}

function formatNetworkStatDebug(networkStat: Systeminformation.NetworkStatsData): NetworkStatDebug {
    return {
        interfaceId: networkStat.iface,
        operstate: networkStat.operstate,
        receiveBytes: networkStat.rx_bytes,
        receiveBytesPerSecond: networkStat.rx_sec,
        receiveErrors: networkStat.rx_errors,
        receiveDropped: networkStat.rx_dropped,
        transmitBytes: networkStat.tx_bytes,
        transmitBytesPerSecond: networkStat.tx_sec,
        transmitErrors: networkStat.tx_errors,
        transmitDropped: networkStat.tx_dropped,
        sampleMilliseconds: networkStat.ms,
    };
}

function formatNetworkRateCalculationDebug(rateCalculation: NetworkRateCalculation): NetworkRateCalculationDebug {
    return {
        interfaceId: rateCalculation.interfaceId,
        direction: rateCalculation.direction,
        currentBytes: rateCalculation.currentBytes,
        previousBytes: rateCalculation.previousBytes,
        bytesDelta: rateCalculation.bytesDelta,
        elapsedMilliseconds: rateCalculation.elapsedMilliseconds,
        computedBytesPerSecond: Math.round(rateCalculation.bytesPerSecond),
        hadPreviousSample: rateCalculation.hadPreviousSample,
    };
}

function formatRawNetworkInterfaceDebug(networkInterface: Systeminformation.NetworkInterfacesData): RawNetworkInterfaceDebug {
    return {
        interfaceId: networkInterface.iface,
        name: networkInterface.ifaceName || networkInterface.iface,
        type: networkInterface.type,
        operstate: networkInterface.operstate,
        isDefault: networkInterface.default,
        isInternal: networkInterface.internal,
        isVirtual: networkInterface.virtual,
        speedMegabitsPerSecond: typeof networkInterface.speed === "number" && Number.isFinite(networkInterface.speed)
            ? networkInterface.speed
            : null,
    };
}

export function calculateNetworkRate(options: {
    interfaceId: string;
    direction: NetworkDirection;
    currentBytes: number;
    currentTimestampMilliseconds: number;
    previousSample: NetworkCounterSample | undefined;
}): NetworkRateCalculation {
    if (!options.previousSample || options.currentTimestampMilliseconds <= options.previousSample.timestampMilliseconds) {
        return {
            interfaceId: options.interfaceId,
            direction: options.direction,
            currentBytes: options.currentBytes,
            previousBytes: options.previousSample?.bytes ?? null,
            bytesDelta: null,
            elapsedMilliseconds: options.previousSample
                ? options.currentTimestampMilliseconds - options.previousSample.timestampMilliseconds
                : null,
            bytesPerSecond: 0,
            hadPreviousSample: options.previousSample != null,
        };
    }

    const elapsedSeconds = (options.currentTimestampMilliseconds - options.previousSample.timestampMilliseconds) / 1000;
    const bytesDelta = options.currentBytes - options.previousSample.bytes;

    return {
        interfaceId: options.interfaceId,
        direction: options.direction,
        currentBytes: options.currentBytes,
        previousBytes: options.previousSample.bytes,
        bytesDelta,
        elapsedMilliseconds: options.currentTimestampMilliseconds - options.previousSample.timestampMilliseconds,
        bytesPerSecond: Math.max(0, bytesDelta / elapsedSeconds),
        hadPreviousSample: true,
    };
}

export function resolveMetricGroups(metricKeys: readonly string[]): Set<MetricGroup> {
    if (metricKeys.length === 0) {
        return new Set(["cpu", "memory", "disk", "network", "gpu"]);
    }

    const metricGroups = new Set<MetricGroup>();

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

async function pollWindowsNvidiaGpuTelemetry(): Promise<GpuTelemetryData | null> {
    const output = await runNvidiaSmiTelemetryQuery();

    if (!output) {
        gpuLog.debug("nvidiaSmiEmptyOutput");
        return null;
    }

    const firstGpuLine = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(line => line.length > 0);

    if (!firstGpuLine) {
        gpuLog.debug("nvidiaSmiNoDataLine");
        return null;
    }

    const gpuData = parseNvidiaSmiTelemetryLine(firstGpuLine);

    if (!gpuData) {
        gpuLog.debug(() => [
            "nvidiaSmiNoParsedFields",
            `raw=${firstGpuLine}`,
        ].join(" "));
        return null;
    }

    return gpuData;
}

async function pollSystemInformationGpuTelemetry(): Promise<GpuTelemetryData | null> {
    const graphicsData = await systemInformation.graphics();
    const nvidiaController = graphicsData.controllers.find(graphicsController =>
        graphicsController.vendor.toLowerCase().includes("nvidia") &&
        (typeof graphicsController.utilizationGpu === "number" || typeof graphicsController.temperatureGpu === "number")
    );

    if (!nvidiaController) {
        return null;
    }

    return {
        utilizationGpu: nvidiaController.utilizationGpu,
        modelText: normalizeNonEmptyText(nvidiaController.model),
        temperatureGpu: nvidiaController.temperatureGpu,
        memoryUsed: nvidiaController.memoryUsed,
        memoryTotal: nvidiaController.memoryTotal,
        powerDraw: nvidiaController.powerDraw,
        powerLimit: nvidiaController.powerLimit,
    };
}

function runNvidiaSmiTelemetryQuery(): Promise<string | null> {
    return new Promise(resolve => {
        const queryStartTimestampMilliseconds = Date.now();
        const querySequence = nextNvidiaSmiQueryDebugSequence++;
        activeNvidiaSmiQueryCount += 1;
        gpuLog.debug(() => [
            "nvidiaSmiStart",
            `queryId=${querySequence}`,
            `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
            `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
        ].join(" "));

        execFile(
            "nvidia-smi",
            [...NVIDIA_SMI_ARGUMENTS],
            {
                timeout: NVIDIA_SMI_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 32 * 1024,
            },
            (error: ExecFileException | null, stdout: string) => {
                const elapsedMilliseconds = Date.now() - queryStartTimestampMilliseconds;
                activeNvidiaSmiQueryCount = Math.max(0, activeNvidiaSmiQueryCount - 1);

                if (error) {
                    logNvidiaSmiFailure({
                        error,
                        elapsedMilliseconds,
                        querySequence,
                    });
                    resolve(null);
                    return;
                }

                gpuLog.debug(() => [
                    elapsedMilliseconds > 250 ? "nvidiaSmiSlowSuccess" : "nvidiaSmiSuccess",
                    `queryId=${querySequence}`,
                    `elapsedMs=${elapsedMilliseconds}`,
                    `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
                    `timerDelayMs=${Math.max(0, elapsedMilliseconds - NVIDIA_SMI_TIMEOUT_MS)}`,
                    `stdoutBytes=${stdout.length}`,
                    `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
                ].join(" "));

                resolve(stdout);
            },
        );
    });
}

function logNvidiaSmiFailure(options: {
    error: ExecFileException;
    elapsedMilliseconds: number;
    querySequence: number;
}): void {
    const currentTimestampMilliseconds = Date.now();

    if (
        currentTimestampMilliseconds - lastNvidiaSmiFailureLogTimestampMilliseconds
        < NVIDIA_SMI_FAILURE_LOG_INTERVAL_MS
    ) {
        return;
    }

    lastNvidiaSmiFailureLogTimestampMilliseconds = currentTimestampMilliseconds;
    gpuLog.warn(() => [
        "nvidia-smi GPU telemetry query failed",
        `queryId=${options.querySequence}`,
        `elapsedMs=${options.elapsedMilliseconds}`,
        `timeoutMs=${NVIDIA_SMI_TIMEOUT_MS}`,
        `timerDelayMs=${Math.max(0, options.elapsedMilliseconds - NVIDIA_SMI_TIMEOUT_MS)}`,
        `code=${String(options.error.code ?? "unknown")}`,
        `signal=${String(options.error.signal ?? "none")}`,
        `activeNvidiaSmiQueries=${activeNvidiaSmiQueryCount}`,
        `message=${options.error.message}`,
    ].join(" "));
}

export function parseNvidiaSmiTelemetryLine(firstGpuLine: string): GpuTelemetryData | null {
    const fields = firstGpuLine.split(",").map(field => field.trim());
    const utilizationGpu = parseNvidiaSmiNumber(fields[0]);
    const modelText = normalizeNonEmptyText(fields[1]);
    const temperatureGpu = parseNvidiaSmiNumber(fields[2]);
    const memoryUsed = parseNvidiaSmiNumber(fields[3]);
    const memoryTotal = parseNvidiaSmiNumber(fields[4]);
    const powerDraw = parseNvidiaSmiNumber(fields[5]);
    const powerLimit = parseNvidiaSmiNumber(fields[6]);

    if (
        utilizationGpu == null
        && temperatureGpu == null
        && memoryUsed == null
        && memoryTotal == null
        && powerDraw == null
        && powerLimit == null
        && modelText == null
    ) {
        return null;
    }

    return {
        utilizationGpu,
        modelText,
        temperatureGpu,
        memoryUsed,
        memoryTotal,
        powerDraw,
        powerLimit,
    };
}

export function parseNvidiaSmiNumber(value: string | undefined): number | undefined {
    if (!value || value.toUpperCase() === "N/A") {
        return undefined;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function normalizeNonEmptyText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();

    return normalizedValue && normalizedValue.toUpperCase() !== "N/A"
        ? normalizedValue
        : undefined;
}

export function formatCpuModelText(cpuData: Systeminformation.CpuData): string | null {
    const modelParts = [
        normalizeNonEmptyText(cpuData.manufacturer),
        normalizeNonEmptyText(cpuData.brand),
    ];
    const modelText = modelParts
        .filter((modelPart): modelPart is string => modelPart != null)
        .join(" ")
        .trim();

    return modelText.length > 0 ? modelText : null;
}

export function isUsableFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.size > 0
        && fileSystem.mount.length > 0
        && fileSystem.available >= 0
        && fileSystem.used >= 0;
}

export function toDiskVolumeOption(
    fileSystem: Systeminformation.FsSizeData,
    blockDevices: readonly Systeminformation.BlockDevicesData[],
    diskLayout: readonly Systeminformation.DiskLayoutData[],
): DiskVolumeOption {
    const blockDevice = blockDevices.find(device => device.mount === fileSystem.mount || device.name === fileSystem.fs);
    const physicalDisk = resolvePhysicalDisk(fileSystem, blockDevice, diskLayout);

    return {
        id: fileSystem.mount || fileSystem.fs,
        fs: fileSystem.fs,
        mount: fileSystem.mount,
        sizeBytes: fileSystem.size,
        usedBytes: fileSystem.used,
        availableBytes: fileSystem.available,
        storageKind: resolveDiskStorageKind(physicalDisk, blockDevice),
        diskName: physicalDisk?.name ?? fileSystem.fs,
        volumeLabel: blockDevice?.label ?? "",
    };
}

export function resolvePhysicalDisk(
    fileSystem: Systeminformation.FsSizeData,
    blockDevice: Systeminformation.BlockDevicesData | undefined,
    diskLayout: readonly Systeminformation.DiskLayoutData[],
): Systeminformation.DiskLayoutData | undefined {
    if (blockDevice && !isLocalBlockDevice(blockDevice)) {
        return undefined;
    }

    if (diskLayout.length === 0) {
        return undefined;
    }

    const normalizedBlockDeviceText = blockDevice
        ? `${blockDevice.device ?? ""} ${blockDevice.name} ${blockDevice.model}`.toLowerCase()
        : "";
    const matchingDisk = diskLayout.find(disk => {
        const normalizedDiskText = `${disk.device ?? ""} ${disk.name}`.toLowerCase();
        return normalizedDiskText.length > 0 && normalizedBlockDeviceText.includes(normalizedDiskText);
    });

    if (matchingDisk) {
        return matchingDisk;
    }

    if (diskLayout.length === 1) {
        return diskLayout[0];
    }

    return diskLayout
        .filter(disk => disk.size >= fileSystem.size)
        .sort((leftDisk, rightDisk) => leftDisk.size - rightDisk.size)[0]
        ?? diskLayout[0];
}

export function resolveDiskStorageKind(
    diskLayout: Systeminformation.DiskLayoutData | undefined,
    blockDevice: Systeminformation.BlockDevicesData | undefined,
): DiskStorageKind {
    if (blockDevice && !isLocalBlockDevice(blockDevice)) {
        return "network";
    }

    if (!diskLayout) {
        return "unknown";
    }

    const diskType = diskLayout.type.toLowerCase();

    if (diskType === "ssd" || diskType === "nvme" || diskType === "scm") {
        return "ssd";
    }

    if (diskType === "hd") {
        return "hdd";
    }

    return "unknown";
}

export function isLocalBlockDevice(blockDevice: Systeminformation.BlockDevicesData): boolean {
    const physicalKind = blockDevice.physical.toLowerCase();

    if (physicalKind === "network") {
        return false;
    }

    return true;
}

export function resolveDefaultDiskVolume(diskVolumes: readonly DiskVolumeOption[]): DiskVolumeOption | null {
    return diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

export function calculatePercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
}

export function normalizeNullableRate(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isFinitePositiveNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type MetricGroup = "cpu" | "memory" | "disk" | "network" | "gpu";

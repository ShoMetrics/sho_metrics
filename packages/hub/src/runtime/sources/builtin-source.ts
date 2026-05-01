import streamDeck from "@elgato/streamdeck";
import si, { type Systeminformation } from "systeminformation";
import type { IMetricSource, IMetricSnapshot, IMetricValue } from "./source.interface";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../network-metric-keys";
import { diskVolumeRegistry, type DiskStorageKind, type DiskVolumeOption } from "../disk-volumes";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../disk-metric-keys";

/**
 * Built-in metric source using the `systeminformation` npm package.
 * Provides basic CPU, network, and GPU metrics mapped to the universal protobuf schema.
 */
export class BuiltinSource implements IMetricSource {
    readonly sourceId = "builtin-node";

    private lastNetworkStatsByInterface = new Map<string, NetworkCounterSample>();
    private cachedGpuData: Systeminformation.GraphicsControllerData | null = null;
    private cachedGpuTimestampMilliseconds = 0;
    private pendingGpuPromise: Promise<Systeminformation.GraphicsControllerData | null> | null = null;

    private static readonly GPU_CACHE_MS = 1000;
    private static readonly GPU_POLL_TIMEOUT_MS = 750;

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
            metrics["gpu.power"] = {
                scalar: gpu.powerDraw ?? 0,
                unit: "W",
            };
        }

        return {
            sourceId: this.sourceId,
            timestampMs: pollStartTimestampMilliseconds,
            metrics,
        };
    }

    private async pollMemory(): Promise<Record<string, IMetricValue>> {
        try {
            const memoryData = await si.mem();

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
            streamDeck.logger.error(`[BuiltinSource] Memory poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollDiskSafely(metricKeys: readonly string[]): Promise<Record<string, IMetricValue>> {
        try {
            return await this.pollDisk(metricKeys);
        } catch (error) {
            streamDeck.logger.error(`[BuiltinSource] Disk poll error: ${String(error)}`);
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
            si.fsSize(),
            si.blockDevices().catch(error => {
                streamDeck.logger.warn(`[BuiltinSource] Block device poll error: ${String(error)}`);
                return [] as Systeminformation.BlockDevicesData[];
            }),
            si.diskLayout().catch(error => {
                streamDeck.logger.warn(`[BuiltinSource] Disk layout poll error: ${String(error)}`);
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
        const fileSystemStats = await si.fsStats();

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
            const load = await si.currentLoad();

            return {
                "cpu.usage_percent": {
                    scalar: load.currentLoad,
                    unit: "%",
                    progress: Math.min(Math.max(load.currentLoad / 100, 0), 1),
                },
            };
        } catch (error) {
            streamDeck.logger.error(`[BuiltinSource] CPU poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollNetworkSafely(): Promise<Record<string, IMetricValue>> {
        try {
            return await this.pollNetwork();
        } catch (error) {
            streamDeck.logger.error(`[BuiltinSource] Network poll error: ${String(error)}`);
            return {};
        }
    }

    private async pollNetwork(): Promise<Record<string, IMetricValue>> {
        const metrics: Record<string, IMetricValue> = {};
        const networkInterfaces = await si.networkInterfaces();
        const usableNetworkInterfaces = Array.isArray(networkInterfaces)
            ? networkInterfaces.filter(isUsableNetworkInterface)
            : [];
        const interfaceOptions = usableNetworkInterfaces.map(toNetworkInterfaceOption);
        const usableInterfaceIds = new Set(interfaceOptions.map((networkInterface) => networkInterface.id));
        const networkStats = await si.networkStats("*");
        const currentTimestampMilliseconds = Date.now();
        let aggregateDownloadBytesPerSecond = 0;
        let aggregateUploadBytesPerSecond = 0;

        networkInterfaceRegistry.update(interfaceOptions);

        for (const networkStat of networkStats) {
            if (!usableInterfaceIds.has(networkStat.iface)) {
                continue;
            }

            const downloadBytesPerSecond = this.calculateNetworkRate({
                interfaceId: networkStat.iface,
                direction: "download",
                currentBytes: networkStat.rx_bytes,
                currentTimestampMilliseconds,
            });
            const uploadBytesPerSecond = this.calculateNetworkRate({
                interfaceId: networkStat.iface,
                direction: "upload",
                currentBytes: networkStat.tx_bytes,
                currentTimestampMilliseconds,
            });

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

        return metrics;
    }

    private calculateNetworkRate(options: {
        interfaceId: string;
        direction: NetworkDirection;
        currentBytes: number;
        currentTimestampMilliseconds: number;
    }): number {
        const sampleKey = `${options.interfaceId}:${options.direction}`;
        const previousSample = this.lastNetworkStatsByInterface.get(sampleKey);
        this.lastNetworkStatsByInterface.set(sampleKey, {
            bytes: options.currentBytes,
            timestampMilliseconds: options.currentTimestampMilliseconds,
        });

        if (!previousSample || options.currentTimestampMilliseconds <= previousSample.timestampMilliseconds) {
            return 0;
        }

        const elapsedSeconds = (options.currentTimestampMilliseconds - previousSample.timestampMilliseconds) / 1000;
        const bytesDelta = options.currentBytes - previousSample.bytes;

        return Math.max(0, bytesDelta / elapsedSeconds);
    }

    private async pollGpu(): Promise<Systeminformation.GraphicsControllerData | null> {
        const currentTimestampMilliseconds = Date.now();

        if (this.cachedGpuData && (currentTimestampMilliseconds - this.cachedGpuTimestampMilliseconds) < BuiltinSource.GPU_CACHE_MS) {
            return this.cachedGpuData;
        }

        if (this.pendingGpuPromise) {
            return this.pendingGpuPromise;
        }

        this.pendingGpuPromise = (async () => {
            try {
                const graphicsData = await si.graphics();
                const nvidiaController = graphicsData.controllers.find(graphicsController =>
                    graphicsController.vendor.toLowerCase().includes("nvidia") &&
                    (typeof graphicsController.utilizationGpu === "number" || typeof graphicsController.temperatureGpu === "number")
                );

                if (nvidiaController) {
                    this.cachedGpuData = nvidiaController;
                    this.cachedGpuTimestampMilliseconds = Date.now();
                    return nvidiaController;
                }
                return null;
            } catch (error) {
                streamDeck.logger.error(`[BuiltinSource] GPU poll error: ${String(error)}`);
                return null;
            } finally {
                this.pendingGpuPromise = null;
            }
        })();

        return this.pendingGpuPromise;
    }

    private async pollGpuWithTimeout(): Promise<Systeminformation.GraphicsControllerData | null> {
        const timeoutPromise = new Promise<Systeminformation.GraphicsControllerData | null>((resolve) => {
            setTimeout(() => {
                streamDeck.logger.warn("[BuiltinSource] GPU poll exceeded timeout; reusing cached GPU data when available");
                resolve(this.cachedGpuData);
            }, BuiltinSource.GPU_POLL_TIMEOUT_MS);
        });

        return Promise.race([this.pollGpu(), timeoutPromise]);
    }
}

interface NetworkCounterSample {
    bytes: number;
    timestampMilliseconds: number;
}

function isUsableNetworkInterface(networkInterface: Systeminformation.NetworkInterfacesData): boolean {
    return !networkInterface.internal
        && !networkInterface.virtual
        && networkInterface.operstate === "up"
        && networkInterface.iface.length > 0;
}

function toNetworkInterfaceOption(networkInterface: Systeminformation.NetworkInterfacesData): NetworkInterfaceOption {
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

function normalizeNetworkInterfaceType(type: string): NetworkInterfaceOption["type"] {
    if (type === "wired" || type === "wireless") {
        return type;
    }

    return "unknown";
}

function resolveMetricGroups(metricKeys: readonly string[]): Set<MetricGroup> {
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

function isUsableFileSystem(fileSystem: Systeminformation.FsSizeData): boolean {
    return fileSystem.size > 0
        && fileSystem.mount.length > 0
        && fileSystem.available >= 0
        && fileSystem.used >= 0;
}

function toDiskVolumeOption(
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
        storageKind: resolveDiskStorageKind(physicalDisk),
        diskName: physicalDisk?.name ?? fileSystem.fs,
    };
}

function resolvePhysicalDisk(
    fileSystem: Systeminformation.FsSizeData,
    blockDevice: Systeminformation.BlockDevicesData | undefined,
    diskLayout: readonly Systeminformation.DiskLayoutData[],
): Systeminformation.DiskLayoutData | undefined {
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

function resolveDiskStorageKind(diskLayout: Systeminformation.DiskLayoutData | undefined): DiskStorageKind {
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

function resolveDefaultDiskVolume(diskVolumes: readonly DiskVolumeOption[]): DiskVolumeOption | null {
    return diskVolumes.find(diskVolume => diskVolume.mount === "/" || /^[A-Z]:\\?$/i.test(diskVolume.mount))
        ?? diskVolumes[0]
        ?? null;
}

function calculatePercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
}

function normalizeNullableRate(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

type MetricGroup = "cpu" | "memory" | "disk" | "network" | "gpu";

import streamDeck from "@elgato/streamdeck";
import si, { type Systeminformation } from "systeminformation";
import type { IMetricSource, IMetricSnapshot, IMetricValue } from "./source.interface";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../network-interfaces";
import { getNetworkAggregateMetricKey, getNetworkInterfaceMetricKey, type NetworkDirection } from "../network-metric-keys";

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

        const [cpuMetrics, networkMetrics, gpu] = await Promise.all([
            metricGroups.has("cpu") ? this.pollCpu() : Promise.resolve({}),
            metricGroups.has("network") ? this.pollNetworkSafely() : Promise.resolve({}),
            metricGroups.has("gpu") ? this.pollGpuWithTimeout() : Promise.resolve(null),
        ]);

        Object.assign(metrics, cpuMetrics, networkMetrics);

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
        return new Set(["cpu", "network", "gpu"]);
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

        if (metricKey.startsWith("gpu.")) {
            metricGroups.add("gpu");
        }
    }

    return metricGroups;
}

type MetricGroup = "cpu" | "network" | "gpu";

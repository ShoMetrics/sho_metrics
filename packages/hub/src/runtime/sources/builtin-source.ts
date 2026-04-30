import streamDeck from "@elgato/streamdeck";
import si, { type Systeminformation } from "systeminformation";
import type { IMetricSource, IMetricSnapshot, IMetricValue } from "./source.interface";

/**
 * Built-in metric source using the `systeminformation` npm package.
 * Provides basic CPU, network, and GPU metrics mapped to the universal protobuf schema.
 */
export class BuiltinSource implements IMetricSource {
    readonly sourceId = "builtin-node";

    private lastNetStats: { rx: number; tx: number; time: number } | null = null;
    private cachedGpuData: Systeminformation.GraphicsControllerData | null = null;
    private cachedGpuTime: number = 0;
    private pendingGpuPromise: Promise<Systeminformation.GraphicsControllerData | null> | null = null;

    private static readonly GPU_CACHE_MS = 1000;

    async poll(): Promise<IMetricSnapshot> {
        const metrics: { [k: string]: IMetricValue } = {};

        // 1. CPU
        try {
            const load = await si.currentLoad();
            metrics["cpu.usage_percent"] = {
                scalar: load.currentLoad,
                unit: "%",
                progress: Math.min(Math.max(load.currentLoad / 100, 0), 1),
            };
        } catch (error) {
            streamDeck.logger.error(`[BuiltinSource] CPU poll error: ${error}`);
        }

        // 2. Network
        try {
            const stats = await si.networkStats();
            const currentRx = stats.reduce((acc, s) => acc + s.rx_bytes, 0);
            const currentTx = stats.reduce((acc, s) => acc + s.tx_bytes, 0);
            const currentTime = Date.now();

            let downMbps = 0;
            let upMbps = 0;

            if (this.lastNetStats && currentTime > this.lastNetStats.time) {
                const timeDiffSec = (currentTime - this.lastNetStats.time) / 1000;
                downMbps = (currentRx - this.lastNetStats.rx) / (1024 * 1024) / timeDiffSec;
                upMbps = (currentTx - this.lastNetStats.tx) / (1024 * 1024) / timeDiffSec;
            }

            this.lastNetStats = { rx: currentRx, tx: currentTx, time: currentTime };

            metrics["net.down"] = { scalar: Math.max(0, downMbps), unit: "MB/s" };
            metrics["net.up"] = { scalar: Math.max(0, upMbps), unit: "MB/s" };
        } catch (error) {
            streamDeck.logger.error(`[BuiltinSource] Network poll error: ${error}`);
        }

        // 3. GPU
        const gpu = await this.pollGpu();
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
            timestampMs: Date.now(),
            metrics,
        };
    }

    private async pollGpu(): Promise<Systeminformation.GraphicsControllerData | null> {
        const now = Date.now();

        if (this.cachedGpuData && (now - this.cachedGpuTime) < BuiltinSource.GPU_CACHE_MS) {
            return this.cachedGpuData;
        }

        if (this.pendingGpuPromise) {
            return this.pendingGpuPromise;
        }

        this.pendingGpuPromise = (async () => {
            try {
                const data = await si.graphics();
                const nvidiaController = data.controllers.find(c =>
                    c.vendor.toLowerCase().includes("nvidia") &&
                    (typeof c.utilizationGpu === "number" || typeof c.temperatureGpu === "number")
                );

                if (nvidiaController) {
                    this.cachedGpuData = nvidiaController;
                    this.cachedGpuTime = Date.now();
                    return nvidiaController;
                }
                return null;
            } catch (error) {
                streamDeck.logger.error(`[BuiltinSource] GPU poll error: ${error}`);
                return null;
            } finally {
                this.pendingGpuPromise = null;
            }
        })();

        return this.pendingGpuPromise;
    }
}

import si from "systeminformation";
import type { NetworkMetricDirection } from "../../network-metric-keys";

export type NodeSystemInformationClient = Omit<typeof si, "cpuCurrentSpeed">;

export type NodeSystemMetricGroup = "cpu" | "memory" | "disk" | "network" | "gpu" | "battery";

export interface NodeSystemNetworkCounterSample {
    bytes: number;
    monotonicMilliseconds: number;
}

export interface NodeSystemNetworkRateCalculation {
    interfaceId: string;
    direction: NetworkMetricDirection;
    currentBytes: number;
    previousBytes: number | null;
    bytesDelta: number | null;
    elapsedMilliseconds: number | null;
    bytesPerSecond: number;
    hadPreviousSample: boolean;
}

export interface NodeSystemGpuTelemetryData {
    utilizationGpu?: number;
    modelText?: string;
    temperatureGpu?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    powerDraw?: number;
    powerLimit?: number;
}

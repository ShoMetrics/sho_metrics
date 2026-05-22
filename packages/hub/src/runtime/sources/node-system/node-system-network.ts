import type { Systeminformation } from "systeminformation";
import { type NetworkInterfaceOption } from "../../network-interfaces";
import type { NetworkMetricDirection } from "../../network-metric-keys";
import type {
    NodeSystemNetworkCounterSample,
    NodeSystemNetworkRateCalculation,
} from "./node-system-source-types";

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
    direction: NetworkMetricDirection;
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

export function isUsableNetworkInterface(
    networkInterface: Systeminformation.NetworkInterfacesData,
    platform: NodeJS.Platform = process.platform,
): boolean {
    return !networkInterface.internal
        && !networkInterface.virtual
        && networkInterface.operstate === "up"
        && networkInterface.iface.length > 0
        && !isSystemNetworkInterface(networkInterface.iface, platform);
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

export function isSystemNetworkInterface(interfaceId: string, platform: NodeJS.Platform = process.platform): boolean {
    const normalizedInterfaceId = interfaceId.toLowerCase();

    if (platform === "darwin") {
        return normalizedInterfaceId === "lo0"
            || normalizedInterfaceId.startsWith("awdl")
            || normalizedInterfaceId.startsWith("llw")
            || normalizedInterfaceId.startsWith("utun")
            || normalizedInterfaceId.startsWith("anpi")
            || normalizedInterfaceId.startsWith("bridge")
            || /^ap\d+$/u.test(normalizedInterfaceId);
    }

    return false;
}

export function formatNetworkInterfaceOptionDebug(
    networkInterface: NetworkInterfaceOption,
): NetworkInterfaceOptionDebug {
    return {
        id: networkInterface.id,
        name: networkInterface.name,
        type: networkInterface.type,
        isDefault: networkInterface.isDefault,
        speedMegabitsPerSecond: networkInterface.speedMegabitsPerSecond,
    };
}

export function formatNetworkStatDebug(networkStat: Systeminformation.NetworkStatsData): NetworkStatDebug {
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

export function formatNetworkRateCalculationDebug(
    rateCalculation: NodeSystemNetworkRateCalculation,
): NetworkRateCalculationDebug {
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

export function formatRawNetworkInterfaceDebug(
    networkInterface: Systeminformation.NetworkInterfacesData,
): RawNetworkInterfaceDebug {
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
    direction: NetworkMetricDirection;
    currentBytes: number;
    currentTimestampMilliseconds: number;
    previousSample: NodeSystemNetworkCounterSample | undefined;
}): NodeSystemNetworkRateCalculation {
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

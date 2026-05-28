import assert from "node:assert/strict";
import test from "node:test";
import type { Systeminformation } from "systeminformation";
import { MetricUnit } from "../metric-source";
import { getNetworkPingLatencyMetricKey } from "../../network-metric-keys";
import { NodeSystemSource } from "./node-system-source";
import {
    buildEmptyNodeSystemInformation,
    buildNetworkInterface,
    buildNetworkStats,
} from "./node-system-source-test-helpers";
import type {
    NodeSystemGpuTelemetryData,
    NodeSystemInformationClient,
} from "./node-system-source-types";

test("node system source refreshes cached network interfaces after the cache interval", async () => {
    const networkStatsArguments: Array<string | undefined> = [];
    const networkInterfacesQueue: Systeminformation.NetworkInterfacesData[][] = [
        [buildNetworkInterface({
            iface: "eth0",
            ifaceName: "Ethernet",
        })],
        [buildNetworkInterface({
            iface: "wlan0",
            ifaceName: "Wi-Fi",
            type: "wireless",
        })],
    ];
    let networkInterfacePollCount = 0;
    let networkStatsPollCount = 0;
    let currentTimestampMilliseconds = 1000;
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            networkInterfaces: async () => {
                networkInterfacePollCount += 1;
                return networkInterfacesQueue.shift() ?? [];
            },
            networkStats: (async (interfaces?: string | ((data: Systeminformation.NetworkStatsData[]) => unknown)) => {
                const interfaceIds = typeof interfaces === "string" ? interfaces : undefined;

                networkStatsPollCount += 1;
                networkStatsArguments.push(interfaceIds);
                return [buildNetworkStats({
                    iface: interfaceIds ?? "",
                    rx_bytes: 1000,
                    tx_bytes: 500,
                })];
            }) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => currentTimestampMilliseconds,
    });

    await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 12000;
    await source.pollMetrics(["net.down"]);

    assert.equal(networkInterfacePollCount, 2);
    assert.equal(networkStatsPollCount, 2);
    assert.deepEqual(networkStatsArguments, ["eth0", "wlan0"]);
});

test("node system source uses stale network interfaces when refresh fails", async () => {
    const networkStatsArguments: Array<string | undefined> = [];
    let networkInterfacePollCount = 0;
    let networkStatsPollCount = 0;
    let currentTimestampMilliseconds = 1000;
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            networkInterfaces: async () => {
                networkInterfacePollCount += 1;
                if (networkInterfacePollCount > 1) {
                    throw new Error("network interface refresh failed");
                }

                return [buildNetworkInterface({ iface: "eth0" })];
            },
            networkStats: (async (interfaces?: string | ((data: Systeminformation.NetworkStatsData[]) => unknown)) => {
                const interfaceIds = typeof interfaces === "string" ? interfaces : undefined;

                networkStatsPollCount += 1;
                networkStatsArguments.push(interfaceIds);
                return [buildNetworkStats({
                    iface: interfaceIds ?? "",
                    rx_bytes: 1000 * networkStatsPollCount,
                    tx_bytes: 500,
                })];
            }) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => currentTimestampMilliseconds,
    });

    await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 11000;
    const staleSnapshot = await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 12000;
    await source.pollMetrics(["net.down"]);

    assert.equal(networkInterfacePollCount, 2);
    assert.equal(networkStatsPollCount, 3);
    assert.deepEqual(networkStatsArguments, ["eth0", "eth0", "eth0"]);
    assert.equal(readScalarMetric(staleSnapshot, "net.down.eth0"), 100);
});

test("node system source stops using stale network interfaces after the freshness budget", async () => {
    let networkInterfacePollCount = 0;
    let networkStatsPollCount = 0;
    let currentTimestampMilliseconds = 1000;
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            networkInterfaces: async () => {
                networkInterfacePollCount += 1;
                if (networkInterfacePollCount > 1) {
                    throw new Error("network interface refresh failed");
                }

                return [buildNetworkInterface({ iface: "eth0" })];
            },
            networkStats: (async () => {
                networkStatsPollCount += 1;
                return [buildNetworkStats({
                    iface: "eth0",
                    rx_bytes: 1000 * networkStatsPollCount,
                    tx_bytes: 500,
                })];
            }) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => currentTimestampMilliseconds,
    });

    await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 11000;
    const staleSnapshot = await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 32000;
    const expiredSnapshot = await source.pollMetrics(["net.down"]);

    assert.equal(networkInterfacePollCount, 3);
    assert.equal(networkStatsPollCount, 2);
    assert.equal(readScalarMetric(staleSnapshot, "net.down.eth0"), 100);
    assert.equal(readScalarMetric(expiredSnapshot, "net.down.eth0"), undefined);
    assert.equal(readScalarMetric(expiredSnapshot, "net.down"), undefined);
});

test("node system source returns aggregate zero when cached interfaces have no stats", async () => {
    const networkStatsArguments: Array<string | undefined> = [];
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            networkInterfaces: async () => [buildNetworkInterface({ iface: "eth0" })],
            networkStats: (async (interfaces?: string | ((data: Systeminformation.NetworkStatsData[]) => unknown)) => {
                networkStatsArguments.push(typeof interfaces === "string" ? interfaces : undefined);
                return [];
            }) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => 1000,
    });

    const snapshot = await source.pollMetrics(["net.down"]);

    assert.deepEqual(networkStatsArguments, ["eth0"]);
    assert.equal(readScalarMetric(snapshot, "net.down"), 0);
    assert.equal(snapshot.metrics["net.down.eth0"], undefined);
});

test("node system source polls ping without traffic interface discovery", async () => {
    const inetLatencyCalls: string[] = [];
    let networkInterfacesPollCount = 0;
    let networkStatsPollCount = 0;
    const pingMetricKey = getNetworkPingLatencyMetricKey("8.8.8.8");
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            inetLatency: (async (host?: string) => {
                if (host) {
                    inetLatencyCalls.push(host);
                }
                return 23;
            }) as NodeSystemInformationClient["inetLatency"],
            networkInterfaces: async () => {
                networkInterfacesPollCount += 1;
                return [buildNetworkInterface({ iface: "eth0" })];
            },
            networkStats: (async () => {
                networkStatsPollCount += 1;
                return [buildNetworkStats({ iface: "eth0" })];
            }) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => 1000,
    });

    const snapshot = await source.pollMetrics([pingMetricKey]);

    assert.deepEqual(inetLatencyCalls, ["8.8.8.8"]);
    assert.equal(networkInterfacesPollCount, 0);
    assert.equal(networkStatsPollCount, 0);
    assert.equal(readScalarMetric(snapshot, pingMetricKey, MetricUnit.MILLISECONDS), 23);
});

test("node system source does not poll ping for empty or traffic-only requests", async () => {
    const inetLatencyCalls: string[] = [];
    const source = new NodeSystemSource({
        systemInformation: {
            ...buildEmptyNodeSystemInformation(),
            inetLatency: (async (host?: string) => {
                if (host) {
                    inetLatencyCalls.push(host);
                }
                return 23;
            }) as NodeSystemInformationClient["inetLatency"],
            networkInterfaces: async () => [buildNetworkInterface({ iface: "eth0" })],
            networkStats: (async () => [buildNetworkStats({ iface: "eth0" })]) as NodeSystemInformationClient["networkStats"],
        } as NodeSystemInformationClient,
        pollWindowsGpuTelemetry: buildNoGpuPoller,
        pollSystemInformationGpuTelemetry: buildNoSystemGpuPoller,
        monotonicNow: () => 1000,
    });

    await source.pollMetrics([]);
    await source.pollMetrics(["net.down"]);

    assert.deepEqual(inetLatencyCalls, []);
});

async function buildNoGpuPoller(): Promise<NodeSystemGpuTelemetryData | null> {
    return null;
}

async function buildNoSystemGpuPoller(): Promise<NodeSystemGpuTelemetryData | null> {
    return null;
}

function readScalarMetric(
    snapshot: Awaited<ReturnType<NodeSystemSource["pollMetrics"]>>,
    metricKey: string,
    unit: MetricUnit = MetricUnit.BYTES_PER_SECOND,
): number | undefined {
    const metricValue = snapshot.metrics[metricKey];
    if (!metricValue || metricValue.value.case !== "scalar" || metricValue.unit !== unit) {
        return undefined;
    }

    return metricValue.value.value;
}


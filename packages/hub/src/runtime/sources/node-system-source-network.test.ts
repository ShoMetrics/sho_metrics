import assert from "node:assert/strict";
import test from "node:test";
import type { Systeminformation } from "systeminformation";
import { NodeSystemSource } from "./node-system-source";
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
            ...buildEmptySystemInformation(),
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
        now: () => currentTimestampMilliseconds,
    });

    await source.pollMetrics(["net.down"]);
    currentTimestampMilliseconds = 12000;
    await source.pollMetrics(["net.down"]);

    assert.equal(networkInterfacePollCount, 2);
    assert.equal(networkStatsPollCount, 2);
    assert.deepEqual(networkStatsArguments, ["eth0", "wlan0"]);
});

function buildEmptySystemInformation(): Partial<NodeSystemInformationClient> {
    return {
        currentLoad: async () => ({ currentLoad: 0 }) as Systeminformation.CurrentLoadData,
        mem: async () => ({ used: 0, total: 0 }) as Systeminformation.MemData,
        fsSize: async () => [],
        blockDevices: async () => [],
        diskLayout: async () => [],
        fsStats: async () => ({ rx_sec: 0, wx_sec: 0, tx_sec: 0 }) as Systeminformation.FsStatsData,
        graphics: async () => ({ controllers: [], displays: [] }) as Systeminformation.GraphicsData,
    };
}

async function buildNoGpuPoller(): Promise<NodeSystemGpuTelemetryData | null> {
    return null;
}

async function buildNoSystemGpuPoller(): Promise<NodeSystemGpuTelemetryData | null> {
    return null;
}

function buildNetworkInterface(
    overrides: Partial<Systeminformation.NetworkInterfacesData> = {},
): Systeminformation.NetworkInterfacesData {
    return {
        iface: "eth0",
        ifaceName: "Ethernet",
        default: false,
        ip4: "",
        ip4subnet: "",
        ip6: "",
        ip6subnet: "",
        mac: "",
        internal: false,
        virtual: false,
        operstate: "up",
        type: "wired",
        duplex: "",
        mtu: 1500,
        speed: null,
        dhcp: false,
        dnsSuffix: "",
        ieee8021xAuth: "",
        ieee8021xState: "",
        carrierChanges: 0,
        ...overrides,
    } as Systeminformation.NetworkInterfacesData;
}

function buildNetworkStats(
    overrides: Partial<Systeminformation.NetworkStatsData> = {},
): Systeminformation.NetworkStatsData {
    return {
        iface: "eth0",
        operstate: "up",
        rx_bytes: 0,
        rx_dropped: 0,
        rx_errors: 0,
        rx_sec: 0,
        tx_bytes: 0,
        tx_dropped: 0,
        tx_errors: 0,
        tx_sec: 0,
        ms: 0,
        ...overrides,
    } as Systeminformation.NetworkStatsData;
}

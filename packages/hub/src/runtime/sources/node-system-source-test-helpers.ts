import type { Systeminformation } from "systeminformation";
import type { NodeSystemInformationClient } from "./node-system-source-types";

export function buildEmptyNodeSystemInformation(): Partial<NodeSystemInformationClient> {
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

export function buildNetworkInterface(
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

export function buildNetworkStats(
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

import assert from "node:assert/strict";
import test from "node:test";
import { diskVolumeRegistry, type DiskVolumeOption } from "./disk-volumes";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "./network-interfaces";

test("network interface registry sorts default wired wireless then unknown", () => {
    try {
        networkInterfaceRegistry.update([
            buildNetworkInterface({ id: "wifi", name: "Wi-Fi", type: "wireless", speedMegabitsPerSecond: 1200 }),
            buildNetworkInterface({ id: "vpn", name: "VPN", type: "unknown" }),
            buildNetworkInterface({ id: "eth", name: "Ethernet", type: "wired", isDefault: true }),
            buildNetworkInterface({ id: "dock", name: "Dock", type: "wired" }),
        ]);

        assert.deepEqual(networkInterfaceRegistry.getOptions().map(option => option.id), [
            "eth",
            "dock",
            "wifi",
            "vpn",
        ]);
    } finally {
        networkInterfaceRegistry.update([]);
    }
});

test("network interface automatic selection prefers maximum speed then display sort", () => {
    try {
        networkInterfaceRegistry.update([
            buildNetworkInterface({ id: "slow-default", name: "Default", type: "wired", isDefault: true, speedMegabitsPerSecond: 100 }),
            buildNetworkInterface({ id: "fast-wifi", name: "Wi-Fi", type: "wireless", speedMegabitsPerSecond: 2400 }),
            buildNetworkInterface({ id: "fast-eth", name: "Ethernet", type: "wired", speedMegabitsPerSecond: 2400 }),
        ]);

        assert.equal(networkInterfaceRegistry.resolveAutomaticSelection()?.id, "fast-eth");
        assert.equal(networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond(), 2400);
        assert.equal(networkInterfaceRegistry.findById("fast-wifi")?.name, "Wi-Fi");
        assert.equal(networkInterfaceRegistry.findById(null), null);
    } finally {
        networkInterfaceRegistry.update([]);
    }
});

test("disk volume registry keeps source order and resolves default root mounts", () => {
    try {
        const secondaryVolume = buildDiskVolume({ id: "D:\\Games", mount: "D:\\Games" });
        const rootVolume = buildDiskVolume({ id: "C:\\", mount: "C:\\" });

        diskVolumeRegistry.update([secondaryVolume, rootVolume]);

        assert.deepEqual(diskVolumeRegistry.getOptions().map(option => option.id), ["D:\\Games", "C:\\"]);
        assert.equal(diskVolumeRegistry.resolveDefaultSelection(), rootVolume);
        assert.equal(diskVolumeRegistry.findById("D:\\Games"), secondaryVolume);
        assert.equal(diskVolumeRegistry.findById("missing"), null);
    } finally {
        diskVolumeRegistry.update([]);
    }
});

test("empty registries return null selections and no maximum network speed", () => {
    networkInterfaceRegistry.update([]);
    diskVolumeRegistry.update([]);

    assert.equal(networkInterfaceRegistry.resolveAutomaticSelection(), null);
    assert.equal(networkInterfaceRegistry.resolveMaximumAutomaticSpeedMegabitsPerSecond(), null);
    assert.equal(diskVolumeRegistry.resolveDefaultSelection(), null);
});

function buildNetworkInterface(overrides: Partial<NetworkInterfaceOption>): NetworkInterfaceOption {
    return {
        id: "eth0",
        name: "Ethernet",
        type: "wired",
        isDefault: false,
        speedMegabitsPerSecond: null,
        ...overrides,
    };
}

function buildDiskVolume(overrides: Partial<DiskVolumeOption>): DiskVolumeOption {
    return {
        id: "C:\\",
        fs: "C:",
        mount: "C:\\",
        sizeBytes: 1000,
        usedBytes: 400,
        availableBytes: 600,
        storageKind: "ssd",
        diskName: "Example Disk",
        volumeLabel: "",
        ...overrides,
    };
}

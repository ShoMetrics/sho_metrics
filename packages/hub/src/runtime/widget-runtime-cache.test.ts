import assert from "node:assert/strict";
import test from "node:test";
import type { DiskVolumeOption } from "./disk-volumes";
import type { NetworkInterfaceOption } from "./network-interfaces";
import { WidgetRuntimeCacheStore } from "./widget-runtime-cache";

test("unchanged scalar field does not update the cache", () => {
    const store = new WidgetRuntimeCacheStore();

    store.update({ runtimeMaximumDownloadSpeedMbps: 100 });

    assert.equal(store.update({ runtimeMaximumDownloadSpeedMbps: 100 }), false);
    assert.equal(store.current().runtimeMaximumDownloadSpeedMbps, 100);
});

test("changed scalar field updates the cache", () => {
    const store = new WidgetRuntimeCacheStore();

    assert.equal(store.update({ runtimeMaximumDownloadSpeedMbps: 100 }), true);

    assert.equal(store.current().runtimeMaximumDownloadSpeedMbps, 100);
});

test("equal network interface option arrays do not update the cache", () => {
    const store = new WidgetRuntimeCacheStore();
    const networkInterfaces = [buildNetworkInterfaceOption()];

    store.update({ availableNetworkInterfaces: networkInterfaces });

    assert.equal(store.update({ availableNetworkInterfaces: [buildNetworkInterfaceOption()] }), false);
});

test("changed network interface field updates the cache", () => {
    const store = new WidgetRuntimeCacheStore();

    store.update({ availableNetworkInterfaces: [buildNetworkInterfaceOption()] });

    assert.equal(store.update({
        availableNetworkInterfaces: [
            buildNetworkInterfaceOption({ speedMegabitsPerSecond: 2500 }),
        ],
    }), true);
    assert.equal(store.current().availableNetworkInterfaces[0].speedMegabitsPerSecond, 2500);
});

test("equal disk volume option arrays do not update the cache", () => {
    const store = new WidgetRuntimeCacheStore();

    store.update({ availableDiskVolumes: [buildDiskVolumeOption()] });

    assert.equal(store.update({ availableDiskVolumes: [buildDiskVolumeOption()] }), false);
});

test("changed disk volume field updates the cache", () => {
    const store = new WidgetRuntimeCacheStore();

    store.update({ availableDiskVolumes: [buildDiskVolumeOption()] });

    assert.equal(store.update({
        availableDiskVolumes: [
            buildDiskVolumeOption({ availableBytes: 512 }),
        ],
    }), true);
    assert.equal(store.current().availableDiskVolumes[0].availableBytes, 512);
});

function buildNetworkInterfaceOption(
    options: Partial<NetworkInterfaceOption> = {},
): NetworkInterfaceOption {
    return {
        id: options.id ?? "eth0",
        name: options.name ?? "Ethernet",
        type: options.type ?? "wired",
        isDefault: options.isDefault ?? true,
        speedMegabitsPerSecond: options.speedMegabitsPerSecond ?? 1000,
    };
}

function buildDiskVolumeOption(options: Partial<DiskVolumeOption> = {}): DiskVolumeOption {
    return {
        id: options.id ?? "C:",
        fs: options.fs ?? "NTFS",
        mount: options.mount ?? "C:\\",
        sizeBytes: options.sizeBytes ?? 1024,
        usedBytes: options.usedBytes ?? 256,
        availableBytes: options.availableBytes ?? 768,
        storageKind: options.storageKind ?? "ssd",
        diskName: options.diskName ?? "Disk 0",
        volumeLabel: options.volumeLabel ?? "System",
    };
}

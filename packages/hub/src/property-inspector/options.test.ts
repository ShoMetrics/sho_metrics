import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveDiskAutoLinearLabel,
    resolveDiskVolumeOptions,
    resolveNetworkInterfaceOptions,
    resolveSelectedDiskVolumeLabel,
} from "./options";
import type { DiskVolumeOption } from "../runtime/disk-volumes";
import { buildVisibilityContext, type InspectorTestSettings } from "./test-context";

test("network interface options include automatic and formatted interfaces", () => {
    const context = buildContext({
        runtimeCache: {
            availableNetworkInterfaces: [
                {
                    id: "eth0",
                    name: "Ethernet",
                    type: "wired",
                    isDefault: true,
                    speedMegabitsPerSecond: 2500,
                },
            ],
        },
    });

    assert.deepEqual(resolveNetworkInterfaceOptions(context), [
        { value: "", label: "Automatic" },
        { value: "eth0", label: "Ethernet (default, wired, eth0, 2500 Mbps)" },
    ]);
});

test("disk volume options include automatic and compact capacity labels", () => {
    const context = buildContext({
        runtimeCache: {
            availableDiskVolumes: [
                buildDiskVolume({
                    id: "C:\\",
                    mount: "C:\\",
                    volumeLabel: "System",
                    sizeBytes: 1024 ** 3,
                }),
            ],
        },
    });

    assert.deepEqual(resolveDiskVolumeOptions(context), [
        { value: "", label: "Automatic" },
        { value: "C:\\", label: "C: (1.0 GB, System)" },
    ]);
});

test("selected disk labels prefer explicit selection then root fallback", () => {
    const context = buildContext({
        metric: {
            diskVolumeId: "D:\\Games",
        },
        runtimeCache: {
            availableDiskVolumes: [
                buildDiskVolume({ id: "C:\\", mount: "C:\\", volumeLabel: "System", storageKind: "ssd" }),
                buildDiskVolume({ id: "D:\\Games", mount: "D:\\Games", volumeLabel: "Games", storageKind: "hdd" }),
            ],
        },
    });
    const automaticContext = buildContext({
        runtimeCache: {
            availableDiskVolumes: context.settings.runtimeCache?.availableDiskVolumes,
        },
    });

    assert.equal(resolveSelectedDiskVolumeLabel(context), "Games");
    assert.equal(resolveDiskAutoLinearLabel(context), "Auto: HDD (GAME)");
    assert.equal(resolveDiskAutoLinearLabel(automaticContext), "Auto: SSD (C:)");
});

test("selected disk label returns dash when no valid disk is available", () => {
    assert.equal(resolveSelectedDiskVolumeLabel(buildContext()), "-");
    assert.equal(resolveDiskAutoLinearLabel(buildContext()), "Auto");
});

function buildContext(settings: InspectorTestSettings = {}) {
    return buildVisibilityContext({
        actionKind: "disk",
        settings: {
            ...settings,
        },
    });
}

function buildDiskVolume(overrides: Partial<DiskVolumeOption> = {}): DiskVolumeOption {
    return {
        id: "/",
        fs: "/dev/disk1",
        mount: "/",
        storageKind: "ssd",
        diskName: "Example Disk",
        volumeLabel: "",
        sizeBytes: 500 * 1024 ** 3,
        usedBytes: 200 * 1024 ** 3,
        availableBytes: 300 * 1024 ** 3,
        ...overrides,
    };
}

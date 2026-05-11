import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveDiskAutoLinearLabel,
    resolveDiskVolumeOptions,
    resolveNetworkInterfaceOptions,
    resolveSelectedDiskVolumeLabel,
} from "./runtime-select-options";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";

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

    const optionList = resolveNetworkInterfaceOptions(context);

    assert.deepEqual(optionList, [
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

    const optionList = resolveDiskVolumeOptions(context);

    assert.deepEqual(optionList, [
        { value: "", label: "Automatic" },
        { value: "C:\\", label: "C: (1.0 GB, System)" },
    ]);
});

test("selected disk labels prefer explicit selection then root fallback", () => {
    const context = buildContext({
        settings: {
            metric: {
                diskVolumeId: "D:\\Games",
            },
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
            availableDiskVolumes: context.runtimeCache.availableDiskVolumes,
        },
    });

    assert.equal(resolveSelectedDiskVolumeLabel(context), "Games");
    assert.equal(resolveDiskAutoLinearLabel(context), "Auto: HDD (GAME)");
    assert.equal(resolveDiskAutoLinearLabel(automaticContext), "Auto: SSD (C:)");
});

test("selected disk label returns dash when no valid disk is available", () => {
    const context = buildContext();
    const selectedDiskVolumeLabel = resolveSelectedDiskVolumeLabel(context);
    const diskAutoLinearLabel = resolveDiskAutoLinearLabel(context);

    assert.equal(selectedDiskVolumeLabel, "-");
    assert.equal(diskAutoLinearLabel, "Auto");
});

function buildContext(options: {
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
} = {}) {
    return buildVisibilityContext({
        actionKind: "disk",
        settings: options.settings,
        runtimeCache: options.runtimeCache,
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

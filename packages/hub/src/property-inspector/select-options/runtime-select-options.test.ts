import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveDiskBarLabelPlaceholder,
    resolveDiskVolumeOptions,
    resolveNetworkInterfaceOptions,
    resolveSelectedDiskVolumeLabel,
} from "./runtime-select-options";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import type { PropertyInspectorRuntimeCacheStatus } from "../inspector/types";
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

test("disk volume options include explicit volumes and compact capacity labels", () => {
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
        { value: "C:\\", label: "C: (1.0 GB, System)" },
    ]);
});

test("disk volume options show loading before disk volume options arrive", () => {
    const context = buildContext();

    const optionList = resolveDiskVolumeOptions(context);

    assert.deepEqual(optionList, [
        { value: "", label: "Loading volumes...", disabled: true },
    ]);
});

test("disk volume options preserve selected unavailable volume", () => {
    const context = buildContext({
        runtimeCache: {
            availableDiskVolumes: [
                buildDiskVolume({ id: "C:\\", mount: "C:\\", volumeLabel: "System" }),
            ],
        },
    });

    const optionList = resolveDiskVolumeOptions(context, "E:\\");

    assert.deepEqual(optionList, [
        { value: "E:\\", label: "E: (Unavailable)" },
        { value: "C:\\", label: "C: (500 GB, System)" },
    ]);
});

test("disk volume options show selected unavailable volume before volumes arrive", () => {
    const context = buildContext();

    const optionList = resolveDiskVolumeOptions(context, "E:\\");

    assert.deepEqual(optionList, [
        { value: "E:\\", label: "E: (Unavailable)" },
    ]);
});

test("disk volume options show an empty state after disk volume options arrive empty", () => {
    const context = buildContext({
        runtimeCacheStatus: {
            diskVolumeOptionsStatus: "ready",
        },
    });

    const optionList = resolveDiskVolumeOptions(context);

    assert.deepEqual(optionList, [
        { value: "", label: "No detected volumes", disabled: true },
    ]);
});

test("disk volume options show unavailable when disk volume options fail", () => {
    const context = buildContext({
        runtimeCacheStatus: {
            diskVolumeOptionsStatus: "failed",
        },
    });

    const optionList = resolveDiskVolumeOptions(context);

    assert.deepEqual(optionList, [
        { value: "", label: "Volumes unavailable", disabled: true },
    ]);
});

test("selected disk labels prefer explicit selection then root fallback", () => {
    const context = buildContext({
        settings: buildDiskSettings({ volumeId: "D:\\Games" }),
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
    assert.equal(resolveDiskBarLabelPlaceholder(context), "Auto: HDD (GAME)");
    assert.equal(resolveDiskBarLabelPlaceholder(automaticContext), "Auto: SSD (C:)");
});

test("selected disk label returns dash when no valid disk is available", () => {
    const context = buildContext();
    const selectedDiskVolumeLabel = resolveSelectedDiskVolumeLabel(context);
    const diskBarLabelPlaceholder = resolveDiskBarLabelPlaceholder(context);

    assert.equal(selectedDiskVolumeLabel, "-");
    assert.equal(diskBarLabelPlaceholder, "Auto");
});

function buildContext(options: {
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
    runtimeCacheStatus?: Partial<PropertyInspectorRuntimeCacheStatus>;
} = {}) {
    return buildVisibilityContext({
        actionKind: "disk",
        settings: options.settings ?? buildDiskSettings(),
        runtimeCache: options.runtimeCache,
        runtimeCacheStatus: options.runtimeCacheStatus,
    });
}

function buildDiskSettings(patch: NonNullable<Parameters<typeof writeStoredWidgetSettingsPatch>[1]>["disk"] = {}): InspectorTestSettings {
    return writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            disk: patch,
        },
    );
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

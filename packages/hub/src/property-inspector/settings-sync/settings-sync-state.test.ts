import assert from "node:assert/strict";
import { test } from "vitest";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import {
    initialSettingsSyncState,
    settingsSyncReducer,
    type InspectorGlobalSettingsRead,
    type InspectorWidgetSettingsRead,
} from "./settings-sync-state";
import { settingsNoticeMessages } from "../../i18n/message-groups/settings";

test("connectionLoaded sets action metadata and marks widget settings ready", () => {
    const rawSettings = { preferences: { pollingFrequencySeconds: 5 } };
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "connectionLoaded",
        actionKind: "network",
        platform: "win32",
        isWindows: true,
        widgetSettingsRead: buildWidgetSettingsRead({ rawSettings }),
    });

    assert.equal(nextState.actionKind, "network");
    assert.equal(nextState.platform, "win32");
    assert.equal(nextState.isWindows, true);
    assert.equal(nextState.rawSettings, rawSettings);
    assert.equal(nextState.widgetSettingsStatus, "ready");
    assert.equal(nextState.widgetSettingsNotice, null);
});

test("globalSettingsRead stores readable global settings", () => {
    const rawGlobalSettings = { overrides: { enabled: true } };
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "globalSettingsRead",
        read: buildGlobalSettingsRead({ rawGlobalSettings }),
    });

    assert.equal(nextState.rawGlobalSettings, rawGlobalSettings);
    assert.equal(nextState.globalSettingsStatus, "ready");
    assert.equal(nextState.globalSettingsNotice, null);
});

test("runtimeCachePatch merges runtime cache and marks disk volume options ready", () => {
    const diskVolume = buildDiskVolumeOption();
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "runtimeCachePatch",
        patch: {
            availableDiskVolumes: [diskVolume],
            runtimeMaximumDiskReadThroughputMebibytesPerSecond: 512,
        },
    });

    assert.deepEqual(nextState.runtimeCache.availableDiskVolumes, [diskVolume]);
    assert.equal(nextState.runtimeCache.runtimeMaximumDiskReadThroughputMebibytesPerSecond, 512);
    assert.equal(nextState.runtimeCacheStatus.diskVolumeOptionsStatus, "ready");
});

test("runtimeCachePatch marks battery device options ready", () => {
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "runtimeCachePatch",
        patch: {
            availableBatteryDevices: [],
        },
    });

    assert.equal(nextState.runtimeCacheStatus.batteryDeviceOptionsStatus, "ready");
});

test("runtimeCachePatch uses explicit catalog descriptor load state", () => {
    const descriptorOnlyState = settingsSyncReducer(initialSettingsSyncState, {
        type: "runtimeCachePatch",
        patch: {
            availableCatalogMetricDescriptors: [],
        },
    });
    const failedState = settingsSyncReducer(descriptorOnlyState, {
        type: "runtimeCachePatch",
        patch: {
            availableCatalogMetricDescriptors: [],
            catalogMetricDescriptorLoadState: "failed",
        },
    });
    const readyState = settingsSyncReducer(failedState, {
        type: "runtimeCachePatch",
        patch: {
            catalogMetricDescriptorLoadState: "ready",
        },
    });

    assert.equal(descriptorOnlyState.runtimeCacheStatus.catalogMetricDescriptorStatus, "pending");
    assert.equal(failedState.runtimeCacheStatus.catalogMetricDescriptorStatus, "failed");
    assert.equal(readyState.runtimeCacheStatus.catalogMetricDescriptorStatus, "ready");
});

test("save failure keeps optimistic widget settings and reports warning", () => {
    const rawSettings = { preferences: { pollingFrequencySeconds: 15 } };
    const patchedState = settingsSyncReducer(initialSettingsSyncState, {
        type: "widgetSettingsPatched",
        rawSettings,
    });
    const failedState = settingsSyncReducer(patchedState, {
        type: "widgetSaveFailed",
        errorMessage: "disk full",
    });

    assert.equal(failedState.rawSettings, rawSettings);
    assert.equal(failedState.widgetSettingsStatus, "ready");
    assert.deepEqual(failedState.widgetSettingsNotice, {
        kind: "warning",
        message: settingsNoticeMessages.widgetSettingsSaveFailed,
        values: { errorMessage: "disk full" },
    });
});

test("load failures mark the matching settings scope failed", () => {
    const widgetFailedState = settingsSyncReducer(initialSettingsSyncState, {
        type: "widgetLoadFailed",
    });
    const globalFailedState = settingsSyncReducer(initialSettingsSyncState, {
        type: "globalLoadFailed",
    });

    assert.equal(widgetFailedState.widgetSettingsStatus, "failed");
    assert.equal(widgetFailedState.widgetSettingsNotice?.message, settingsNoticeMessages.widgetSettingsLoadDefaults);
    assert.equal(globalFailedState.globalSettingsStatus, "failed");
    assert.equal(globalFailedState.globalSettingsNotice?.message, settingsNoticeMessages.globalSettingsLoadDefaults);
});

function buildWidgetSettingsRead(
    options: Partial<InspectorWidgetSettingsRead> = {},
): InspectorWidgetSettingsRead {
    return {
        rawSettings: options.rawSettings,
        notice: options.notice ?? null,
        readWarning: options.readWarning ?? null,
    };
}

function buildGlobalSettingsRead(
    options: Partial<InspectorGlobalSettingsRead> = {},
): InspectorGlobalSettingsRead {
    return {
        rawGlobalSettings: options.rawGlobalSettings ?? {},
        notice: options.notice ?? null,
        readWarning: options.readWarning ?? null,
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

import assert from "node:assert/strict";
import test from "node:test";
import type { DiskVolumeOption } from "../../runtime/disk-volumes";
import {
    initialSettingsSyncState,
    settingsSyncReducer,
    type InspectorPluginSettingsRead,
    type InspectorWidgetSettingsRead,
} from "./settings-sync-state";

test("connectionLoaded sets action metadata and marks widget settings ready", () => {
    const rawSettings = { preferences: { pollingFrequencySeconds: 5 } };
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "connectionLoaded",
        actionKind: "network",
        isWindows: true,
        widgetSettingsRead: buildWidgetSettingsRead({ rawSettings }),
    });

    assert.equal(nextState.actionKind, "network");
    assert.equal(nextState.isWindows, true);
    assert.equal(nextState.rawSettings, rawSettings);
    assert.equal(nextState.widgetSettingsStatus, "ready");
    assert.equal(nextState.widgetSettingsNotice, null);
});

test("pluginSettingsRead stores readable global settings", () => {
    const rawGlobalSettings = { overrides: { enabled: true } };
    const nextState = settingsSyncReducer(initialSettingsSyncState, {
        type: "pluginSettingsRead",
        read: buildPluginSettingsRead({ rawGlobalSettings }),
    });

    assert.equal(nextState.rawGlobalSettings, rawGlobalSettings);
    assert.equal(nextState.globalSettingsStatus, "ready");
    assert.equal(nextState.pluginSettingsNotice, null);
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
        text: "Failed to save widget settings: disk full",
    });
});

test("load failures mark the matching settings scope failed", () => {
    const widgetFailedState = settingsSyncReducer(initialSettingsSyncState, {
        type: "widgetLoadFailed",
    });
    const pluginFailedState = settingsSyncReducer(initialSettingsSyncState, {
        type: "pluginLoadFailed",
    });

    assert.equal(widgetFailedState.widgetSettingsStatus, "failed");
    assert.match(
        widgetFailedState.widgetSettingsNotice?.text ?? "",
        /couldn't load this widget's saved settings/,
    );
    assert.equal(pluginFailedState.globalSettingsStatus, "failed");
    assert.match(
        pluginFailedState.pluginSettingsNotice?.text ?? "",
        /couldn't load plugin settings/,
    );
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

function buildPluginSettingsRead(
    options: Partial<InspectorPluginSettingsRead> = {},
): InspectorPluginSettingsRead {
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

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { pluginGlobalSettingsStore } from "../../settings/global-settings-store";
import { readStoredWidgetSettings } from "../../settings/storage/codec";
import { writeStoredGlobalSettingsPatch } from "../../settings/storage/global-settings-patch";
import { resolveInitialActionSettings } from "./action-settings-resolver";

beforeEach(() => {
    pluginGlobalSettingsStore.update(undefined);
});

afterEach(() => {
    pluginGlobalSettingsStore.update(undefined);
});

test("action settings resolver applies global overrides without persisting them into widget settings", () => {
    pluginGlobalSettingsStore.update(writeStoredGlobalSettingsPatch(undefined, {
        globalOverrideEnabled: true,
        viewOverrideEnabled: false,
        themeOverrideEnabled: true,
        paintOverrideEnabled: false,
        theme: {
            selectedTheme: "terminal",
        },
    }));

    const result = resolveInitialActionSettings(undefined, "cpu");
    const storedSettings = readStoredWidgetSettings(result.rawSettings).settings;

    assert.deepEqual(result.settingsJsonToPersist, result.rawSettings);
    assert.equal(result.resolvedSettings.widget.slot.appearance.theme.selectedTheme, "terminal");
    assert.equal(storedSettings.widget.value?.slot?.overrides?.appearance, undefined);
});

test("action settings resolver applies runtime maxima without persisting display defaults", () => {
    const result = resolveInitialActionSettings(undefined, "network", {
        runtimeMaximumDownloadSpeedMbps: 900,
        runtimeMaximumUploadSpeedMbps: 300,
    });
    const target = result.resolvedSettings.widget.slot.metric.target;
    const storedSettings = readStoredWidgetSettings(result.rawSettings).settings;

    assert.equal(target.domain, "network");
    assert.equal(target.reading.kind, "traffic");
    if (target.reading.kind === "traffic") {
        assert.equal(target.reading.display.maximumDownloadSpeedMegabitsPerSecond, 900);
        assert.equal(target.reading.display.maximumUploadSpeedMegabitsPerSecond, 300);
    }
    assert.equal(storedSettings.widget.value?.slot?.overrides?.network, undefined);
});

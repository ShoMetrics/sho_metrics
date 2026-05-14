import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    SingleMetricViewLayout as StoredSingleMetricViewLayout,
} from "../../generated/shometrics/v1/settings_pb";
import { readStoredGlobalSettings } from "./codec";
import { writeStoredGlobalSettingsPatch } from "./global-settings-patch";

test("global settings patch writes global master override", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        globalOverrideEnabled: true,
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.overrides?.enabled, true);
    assert.equal(settings.overrides?.layoutStyle, undefined);
    assert.equal(settings.overrides?.color, undefined);
});

test("global settings patch writes nested layout style and color overrides", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        layoutStyleOverrideEnabled: false,
        colorOverrideEnabled: true,
        layoutStyle: {
            viewLayout: "linear",
        },
        color: {
            colorMode: "black-white",
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    const overrides = settings.overrides;

    assert.equal(overrides?.layoutStyle?.enabled, false);
    assert.equal(overrides?.layoutStyle?.viewLayout, StoredSingleMetricViewLayout.LINEAR);
    assert.equal(overrides?.color?.enabled, true);
    assert.equal(overrides?.color?.colorMode, StoredColorMode.BLACK_WHITE);
});

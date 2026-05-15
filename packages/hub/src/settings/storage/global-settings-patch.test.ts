import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    MetricTheme as StoredMetricTheme,
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
    assert.equal(settings.overrides?.graph, undefined);
    assert.equal(settings.overrides?.theme, undefined);
    assert.equal(settings.overrides?.color, undefined);
});

test("global settings patch writes nested graph theme and color overrides", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        graphOverrideEnabled: false,
        themeOverrideEnabled: true,
        colorOverrideEnabled: true,
        graph: {
            viewLayout: "linear",
        },
        theme: {
            selectedTheme: "color-filled",
        },
        color: {
            colorMode: "black-white",
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    const overrides = settings.overrides;

    assert.equal(overrides?.graph?.enabled, false);
    assert.equal(overrides?.graph?.graph?.viewLayout, StoredSingleMetricViewLayout.LINEAR);
    assert.equal(overrides?.theme?.enabled, true);
    assert.equal(overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.COLOR_FILLED);
    assert.equal(overrides?.color?.enabled, true);
    assert.equal(overrides?.color?.colorMode, StoredColorMode.BLACK_WHITE);
});

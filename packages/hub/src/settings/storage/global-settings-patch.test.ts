import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    MetricTheme as StoredMetricTheme,
    TerminalThemeVariant as StoredTerminalThemeVariant,
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
    assert.equal(settings.overrides?.paint, undefined);
});

test("global settings patch writes nested graph theme and paint overrides", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        graphOverrideEnabled: false,
        themeOverrideEnabled: true,
        paintOverrideEnabled: true,
        graph: {
            viewLayout: "linear",
        },
        theme: {
            selectedTheme: "color-filled",
            terminal: {
                variant: "vintage",
            },
        },
        paint: {
            metric: {
                colorMode: "black-white",
            },
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    const overrides = settings.overrides;

    assert.equal(overrides?.graph?.enabled, false);
    assert.equal(overrides?.graph?.graph?.viewLayout, StoredSingleMetricViewLayout.LINEAR);
    assert.equal(overrides?.theme?.enabled, true);
    assert.equal(overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.COLOR_FILLED);
    assert.equal(overrides?.theme?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
    assert.equal(overrides?.paint?.enabled, true);
    assert.equal(overrides?.paint?.metric?.colorMode, StoredColorMode.BLACK_WHITE);
});

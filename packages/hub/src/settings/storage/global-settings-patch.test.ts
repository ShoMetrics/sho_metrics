import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    MetricView as StoredMetricView,
    MetricTheme as StoredMetricTheme,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
} from "../../generated/shometrics/v1/settings_pb";
import { readStoredGlobalSettings } from "./codec";
import { writeStoredGlobalSettingsPatch } from "./global-settings-patch";

test("global settings patch writes global master override", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        globalOverrideEnabled: true,
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.overrides?.enabled, true);
    assert.equal(settings.overrides?.view, undefined);
    assert.equal(settings.overrides?.theme, undefined);
    assert.equal(settings.overrides?.paint, undefined);
});

test("global settings patch writes nested view theme and paint overrides", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        viewOverrideEnabled: false,
        themeOverrideEnabled: true,
        paintOverrideEnabled: true,
        view: {
            selectedView: "bar",
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
            terminal: {
                preset: "cyan",
            },
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    const overrides = settings.overrides;

    assert.equal(overrides?.view?.enabled, false);
    assert.equal(overrides?.view?.view?.selectedView, StoredMetricView.BAR);
    assert.equal(overrides?.theme?.enabled, true);
    assert.equal(overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.COLOR_FILLED);
    assert.equal(overrides?.theme?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
    assert.equal(overrides?.paint?.enabled, true);
    assert.equal(overrides?.paint?.metric?.colorMode, StoredColorMode.BLACK_WHITE);
    assert.equal(overrides?.paint?.terminal?.preset, StoredTerminalPalettePreset.CYAN);
});

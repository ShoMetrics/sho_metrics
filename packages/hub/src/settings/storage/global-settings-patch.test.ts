import assert from "node:assert/strict";
import test from "node:test";
import {
    ColorMode as StoredColorMode,
    MetricView as StoredMetricView,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    ScaleMode as StoredScaleMode,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
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
            textVariant: "title-card",
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
    assert.equal(overrides?.view?.view?.textVariant, StoredTextViewVariant.TITLE_CARD);
    assert.equal(overrides?.theme?.enabled, true);
    assert.equal(overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.COLOR_FILLED);
    assert.equal(overrides?.theme?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
    assert.equal(overrides?.paint?.enabled, true);
    assert.equal(overrides?.paint?.metric?.colorMode, StoredColorMode.BLACK_WHITE);
    assert.equal(overrides?.paint?.terminal?.preset, StoredTerminalPalettePreset.CYAN);
});

test("global settings patch writes pixel window theme", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        themeOverrideEnabled: true,
        theme: {
            selectedTheme: "pixel-window",
        },
    });

    const settings = readStoredGlobalSettings(nextSettings).settings;
    assert.equal(settings.overrides?.theme?.enabled, true);
    assert.equal(settings.overrides?.theme?.theme?.selectedTheme, StoredMetricTheme.PIXEL_WINDOW);
});

test("global settings patch writes transparent surface override", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        transparentSurfaceOverrideEnabled: true,
        transparentSurface: {
            enabled: true,
            backgroundOpacityPercent: 45,
            textOutlinePercent: 55,
            shapeOutlinePercent: 65,
        },
    });

    const transparentSurface = readStoredGlobalSettings(nextSettings).settings.overrides
        ?.transparentSurface?.transparentSurface;

    assert.equal(readStoredGlobalSettings(nextSettings).settings.overrides?.transparentSurface?.enabled, true);
    assert.equal(transparentSurface?.enabled, true);
    assert.equal(transparentSurface?.backgroundOpacityPercent, 45);
    assert.equal(transparentSurface?.textOutlinePercent, 55);
    assert.equal(transparentSurface?.shapeOutlinePercent, 65);
});

test("global settings patch writes network and disk throughput defaults", () => {
    const nextSettings = writeStoredGlobalSettingsPatch(undefined, {
        network: {
            scaleMode: "custom",
            maximumDownloadSpeedMegabitsPerSecond: 250,
            maximumUploadSpeedMegabitsPerSecond: 100,
            unitBase: "bit",
        },
        diskThroughput: {
            scaleMode: "custom",
            maximumReadThroughputMebibytesPerSecond: 500,
            maximumWriteThroughputMebibytesPerSecond: 300,
        },
    });

    const defaults = readStoredGlobalSettings(nextSettings).settings.defaults;

    assert.equal(defaults?.network?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.network?.maximumDownloadSpeedMegabitsPerSecond, 250);
    assert.equal(defaults?.network?.maximumUploadSpeedMegabitsPerSecond, 100);
    assert.equal(defaults?.network?.unitBase, StoredNetworkUnitBase.BIT);
    assert.equal(defaults?.diskThroughput?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.diskThroughput?.maximumReadThroughputMebibytesPerSecond, 500);
    assert.equal(defaults?.diskThroughput?.maximumWriteThroughputMebibytesPerSecond, 300);
});

test("global settings patch clears optional default maxima without clearing mode choices", () => {
    const initialSettings = writeStoredGlobalSettingsPatch(undefined, {
        network: {
            scaleMode: "custom",
            maximumDownloadSpeedMegabitsPerSecond: 250,
            maximumUploadSpeedMegabitsPerSecond: 100,
            unitBase: "bit",
        },
        diskThroughput: {
            scaleMode: "custom",
            maximumReadThroughputMebibytesPerSecond: 500,
            maximumWriteThroughputMebibytesPerSecond: 300,
        },
    });

    const nextSettings = writeStoredGlobalSettingsPatch(initialSettings, {
        network: {
            maximumDownloadSpeedMegabitsPerSecond: undefined,
            maximumUploadSpeedMegabitsPerSecond: undefined,
        },
        diskThroughput: {
            maximumReadThroughputMebibytesPerSecond: undefined,
            maximumWriteThroughputMebibytesPerSecond: undefined,
        },
    });

    const defaults = readStoredGlobalSettings(nextSettings).settings.defaults;

    assert.equal(defaults?.network?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.network?.maximumDownloadSpeedMegabitsPerSecond, undefined);
    assert.equal(defaults?.network?.maximumUploadSpeedMegabitsPerSecond, undefined);
    assert.equal(defaults?.network?.unitBase, StoredNetworkUnitBase.BIT);
    assert.equal(defaults?.diskThroughput?.scaleMode, StoredScaleMode.CUSTOM);
    assert.equal(defaults?.diskThroughput?.maximumReadThroughputMebibytesPerSecond, undefined);
    assert.equal(defaults?.diskThroughput?.maximumWriteThroughputMebibytesPerSecond, undefined);
});

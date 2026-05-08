import assert from "node:assert/strict";
import test from "node:test";
import {
    applyGlobalAppearanceToVisualSettings,
    buildGlobalChannelColorConfig,
    defaultPluginGlobalSettings,
    deriveTintChannelColors,
    normalizePluginGlobalSettings,
} from "./global-appearance";

test("global appearance settings normalize unsupported values", () => {
    const settings = normalizePluginGlobalSettings({
        overrideWidgetAppearance: "true",
        appearanceDefaults: {
            graphicType: "linear",
            circleStyle: "gauge",
            graphicStyle: "unknown",
            solidColor: "bad",
            colorMode: "threshold",
            lowThreshold: 90,
            highThreshold: 20,
        },
    });

    assert.equal(settings.overrideWidgetAppearance, true);
    assert.equal(settings.appearanceDefaults.graphicType, "linear");
    assert.equal(settings.appearanceDefaults.circleStyle, "gauge");
    assert.equal(settings.appearanceDefaults.graphicStyle, "flat");
    assert.equal(settings.appearanceDefaults.solidColor, "#3b82f6");
    assert.equal(settings.appearanceDefaults.colorMode, "threshold");
    assert.equal(settings.appearanceDefaults.lowThreshold, 20);
    assert.equal(settings.appearanceDefaults.highThreshold, 90);
});

test("global override replaces widget appearance without mutating non-appearance settings", () => {
    const settings = applyGlobalAppearanceToVisualSettings({
        ...defaultPluginGlobalSettings.appearanceDefaults,
        graphicType: "linear",
        circleStyle: "compact",
        graphicStyle: "flat",
        lineSmoothingPercent: 25,
    }, normalizePluginGlobalSettings({
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            graphicType: "circular",
            circleStyle: "gauge",
            graphicStyle: "cupertino-glass",
            solidColor: "#111827",
            colorMode: "solid",
        },
    }));

    assert.equal(settings.graphicType, "circular");
    assert.equal(settings.circleStyle, "gauge");
    assert.equal(settings.graphicStyle, "cupertino-glass");
    assert.equal(settings.solidColor, "#111827");
    assert.equal(settings.lineSmoothingPercent, 25);
});

test("tint channel derivation keeps the selected color as primary and creates strong contrast", () => {
    const lightBlueChannels = deriveTintChannelColors("#93c5fd");
    const darkBlueChannels = deriveTintChannelColors("#1e3a8a");

    assert.equal(lightBlueChannels.primaryColor, "#93c5fd");
    assert.notEqual(lightBlueChannels.secondaryColor, lightBlueChannels.primaryColor);
    assert.ok(resolveRelativeLuminance(lightBlueChannels.secondaryColor) < resolveRelativeLuminance(lightBlueChannels.primaryColor));

    assert.equal(darkBlueChannels.primaryColor, "#1e3a8a");
    assert.notEqual(darkBlueChannels.secondaryColor, darkBlueChannels.primaryColor);
    assert.ok(resolveRelativeLuminance(darkBlueChannels.secondaryColor) > resolveRelativeLuminance(darkBlueChannels.primaryColor));
});

test("global channel color config maps primary to one channel and secondary to the other", () => {
    const settings = normalizePluginGlobalSettings({
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            solidColor: "#3b82f6",
            colorMode: "threshold",
        },
    });
    const primaryConfig = buildGlobalChannelColorConfig("primary", settings);
    const secondaryConfig = buildGlobalChannelColorConfig("secondary", settings);

    assert.equal(primaryConfig.mode, "threshold");
    assert.equal(primaryConfig.solidColor, "#3b82f6");
    assert.notEqual(secondaryConfig.solidColor, primaryConfig.solidColor);
    assert.equal(primaryConfig.thresholds.length, 3);
    assert.equal(secondaryConfig.thresholds.length, 3);
});

function resolveRelativeLuminance(hexColor: string): number {
    const red = Number.parseInt(hexColor.slice(1, 3), 16) / 255;
    const green = Number.parseInt(hexColor.slice(3, 5), 16) / 255;
    const blue = Number.parseInt(hexColor.slice(5, 7), 16) / 255;

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

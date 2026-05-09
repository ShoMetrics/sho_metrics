import assert from "node:assert/strict";
import test from "node:test";
import {
    parseHexColor,
    resolveRelativeLuminance,
} from "../shared/color-utils";
import {
    applyGlobalAppearanceToVisualSettings,
    buildGlobalChannelColorConfig,
    defaultResolvedGlobalSettings,
    deriveTintChannelColors,
} from "./global-appearance";
import { resolveGlobalSettings } from "./resolver";

test("global override replaces widget appearance without mutating non-appearance settings", () => {
    const settings = applyGlobalAppearanceToVisualSettings({
        ...defaultResolvedGlobalSettings.appearanceDefaults,
        graphicType: "linear",
        circleStyle: "compact",
        graphicStyle: "flat",
        lineSmoothingPercent: 25,
    }, resolveGlobalSettings({
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            graphicType: "circular",
            circleStyle: "gauge",
            graphicStyle: "cupertino-glass",
            usageColors: {
                solidColor: "#111827",
            },
            colorMode: "solid",
        },
    }));

    assert.equal(settings.graphicType, "circular");
    assert.equal(settings.circleStyle, "gauge");
    assert.equal(settings.graphicStyle, "cupertino-glass");
    assert.equal(settings.usageColors.solidColor, "#111827");
    assert.equal(settings.lineSmoothingPercent, 25);
});

test("tint channel derivation keeps the selected color as primary and creates strong contrast", () => {
    const lightBlueChannels = deriveTintChannelColors("#93c5fd");
    const darkBlueChannels = deriveTintChannelColors("#1e3a8a");

    assert.equal(lightBlueChannels.primaryColor, "#93c5fd");
    assert.notEqual(lightBlueChannels.secondaryColor, lightBlueChannels.primaryColor);
    assert.ok(readRelativeLuminance(lightBlueChannels.secondaryColor) < readRelativeLuminance(lightBlueChannels.primaryColor));

    assert.equal(darkBlueChannels.primaryColor, "#1e3a8a");
    assert.notEqual(darkBlueChannels.secondaryColor, darkBlueChannels.primaryColor);
    assert.ok(readRelativeLuminance(darkBlueChannels.secondaryColor) > readRelativeLuminance(darkBlueChannels.primaryColor));
});

test("global channel color config maps primary to one channel and secondary to the other", () => {
    const settings = resolveGlobalSettings({
        overrideWidgetAppearance: true,
        appearanceDefaults: {
            usageColors: {
                solidColor: "#3b82f6",
            },
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

function readRelativeLuminance(hexColor: string): number {
    const color = parseHexColor(hexColor);

    if (!color) {
        throw new Error(`Expected a valid hex color, got ${hexColor}.`);
    }

    return resolveRelativeLuminance(color);
}

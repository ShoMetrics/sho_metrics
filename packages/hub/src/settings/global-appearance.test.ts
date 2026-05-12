import assert from "node:assert/strict";
import test from "node:test";
import {
    parseHexColor,
    resolveRelativeLuminance,
} from "../shared/color-utils";
import {
    applyGlobalAppearanceToVisualSettings,
    buildGlobalChannelColorConfig,
    deriveTintChannelColors,
} from "./global-appearance";
import type {
    ResolvedAppearanceSettings,
    ResolvedGlobalAppearanceOverride,
    ResolvedGlobalSettings,
} from "./resolved-settings";

test("global override replaces widget appearance without mutating non-appearance settings", () => {
    const settings = applyGlobalAppearanceToVisualSettings({
        ...defaultAppearanceSettings,
        viewLayout: "linear",
        circleStyle: "compact",
        theme: "flat",
        lineSmoothingPercent: 25,
    }, buildResolvedGlobalSettings({
        appearanceOverride: {
            viewLayout: "circular",
            circleStyle: "gauge",
            theme: "cupertino-glass",
            tintColor: "#111827",
            colorMode: "solid",
        },
    }));

    assert.equal(settings.viewLayout, "circular");
    assert.equal(settings.circleStyle, "gauge");
    assert.equal(settings.theme, "cupertino-glass");
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

test("tint channel derivation fails when the resolved tint color is invalid", () => {
    const deriveInvalidTintChannels = (): void => {
        deriveTintChannelColors("not-a-color");
    };

    assert.throws(deriveInvalidTintChannels, /Expected a valid hex color/);
});

test("global channel color config maps primary to one channel and secondary to the other", () => {
    const settings = buildResolvedGlobalSettings({
        appearanceOverride: {
            tintColor: "#3b82f6",
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

function buildResolvedGlobalSettings(options: {
    appearanceOverride?: Partial<ResolvedGlobalAppearanceOverride>;
} = {}): ResolvedGlobalSettings {
    return {
        defaults: {
            network: {
                scaleMode: "auto",
                maximumDownloadSpeedMegabitsPerSecond: undefined,
                maximumUploadSpeedMegabitsPerSecond: undefined,
                unitBase: "byte",
            },
            diskThroughput: {
                scaleMode: "auto",
                maximumReadThroughputMebibytesPerSecond: undefined,
                maximumWriteThroughputMebibytesPerSecond: undefined,
            },
        },
        appearanceOverride: options.appearanceOverride
            ? {
                viewLayout: "circular",
                circleStyle: "value",
                theme: "flat",
                tintColor: "#3b82f6",
                colorMode: "solid",
                lowColorThresholdPercent: 30,
                highColorThresholdPercent: 70,
                ...options.appearanceOverride,
            }
            : undefined,
        sourceProfiles: [],
        defaultSourceProfileId: undefined,
    };
}

const defaultAppearanceSettings: ResolvedAppearanceSettings = {
    viewLayout: "circular",
    circleStyle: "value",
    theme: "flat",
    colorMode: "threshold",
    usageColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#eab308",
        highColor: "#ef4444",
    },
    downloadColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#3b82f6",
        highColor: "#60a5fa",
    },
    uploadColors: {
        solidColor: "#ef4444",
        lowColor: "#f97316",
        mediumColor: "#ef4444",
        highColor: "#f472b6",
    },
    diskReadColors: {
        solidColor: "#38bdf8",
        lowColor: "#22c55e",
        mediumColor: "#38bdf8",
        highColor: "#60a5fa",
    },
    diskWriteColors: {
        solidColor: "#f472b6",
        lowColor: "#f97316",
        mediumColor: "#f472b6",
        highColor: "#fb7185",
    },
    lowColorThresholdPercent: 30,
    highColorThresholdPercent: 70,
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
};

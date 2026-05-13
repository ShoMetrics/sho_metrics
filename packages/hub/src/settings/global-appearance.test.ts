import assert from "node:assert/strict";
import test from "node:test";
import {
    applyGlobalAppearanceToVisualSettings,
    buildGlobalColorConfig,
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
            colors: {
                ...defaultGlobalColors,
                solidColor: "#111827",
            },
            colorMode: "solid",
        },
    }));

    assert.equal(settings.viewLayout, "circular");
    assert.equal(settings.circleStyle, "gauge");
    assert.equal(settings.theme, "cupertino-glass");
    assert.equal(settings.usageColors.solidColor, "#111827");
    assert.equal(settings.lineSmoothingPercent, 25);
});

test("global color config uses the configured color ramp", () => {
    const appearanceOverride: ResolvedGlobalAppearanceOverride = {
        viewLayout: "circular",
        circleStyle: "value",
        theme: "flat",
        colors: {
            solidColor: "#3b82f6",
            lowColor: "#22c55e",
            mediumColor: "#eab308",
            highColor: "#ef4444",
        },
        colorMode: "threshold",
        lowColorThresholdPercent: 30,
        highColorThresholdPercent: 70,
    };

    const colorConfig = buildGlobalColorConfig(appearanceOverride);

    assert.equal(colorConfig.mode, "threshold");
    assert.equal(colorConfig.solidColor, "#3b82f6");
    assert.deepEqual(colorConfig.thresholds.map((threshold) => threshold.color), [
        "#22c55e",
        "#eab308",
        "#ef4444",
    ]);
});

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
                colors: defaultGlobalColors,
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

const defaultGlobalColors = {
    solidColor: "#3b82f6",
    lowColor: "#22c55e",
    mediumColor: "#eab308",
    highColor: "#ef4444",
};

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

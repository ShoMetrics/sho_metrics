import assert from "node:assert/strict";
import test from "node:test";
import { buildMetricVisualSettings } from "./visual-adapter";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

test("graphic type maps resolved appearance settings to renderer names", () => {
    const circularSettings = buildMetricVisualSettings(buildAppearanceSettings({ viewLayout: "circular" }));
    const linearSettings = buildMetricVisualSettings(buildAppearanceSettings({ viewLayout: "linear" }));
    const sparklineSettings = buildMetricVisualSettings(buildAppearanceSettings({ viewLayout: "sparkline" }));

    assert.equal(circularSettings.graphicType, "circular");
    assert.equal(linearSettings.graphicType, "linear");
    assert.equal(sparklineSettings.graphicType, "sparkline");
});

test("circle style maps resolved appearance settings to renderer presets", () => {
    const compactSettings = buildMetricVisualSettings(buildAppearanceSettings({ circleStyle: "compact" }));
    const gaugeSettings = buildMetricVisualSettings(buildAppearanceSettings({ circleStyle: "gauge" }));
    const valueSettings = buildMetricVisualSettings(buildAppearanceSettings({ circleStyle: "value" }));

    assert.equal(compactSettings.circleStyle, "compact");
    assert.equal(gaugeSettings.circleStyle, "gauge");
    assert.equal(valueSettings.circleStyle, "value");
});

test("graphic style maps resolved appearance settings to theme preset names", () => {
    const cupertinoGlassSettings = buildMetricVisualSettings(buildAppearanceSettings({
        theme: "cupertino-glass",
    }));
    const defaultSettings = buildMetricVisualSettings(buildAppearanceSettings());

    assert.equal(cupertinoGlassSettings.graphicStyle, "cupertino-glass");
    assert.equal(defaultSettings.graphicStyle, "flat");
});

test("solid color mode uses resolved appearance color", () => {
    const visualSettings = buildMetricVisualSettings(buildAppearanceSettings({
        colorMode: "solid",
        usageColors: {
            ...defaultAppearanceSettings.usageColors,
            solidColor: "#123456",
        },
    }));

    assert.equal(visualSettings.colorConfig.solidColor, "#123456");
});

test("threshold values build renderer color bands", () => {
    const colorConfig = buildMetricVisualSettings(buildAppearanceSettings({
        lowColorThresholdPercent: 20,
        highColorThresholdPercent: 90,
    })).colorConfig;

    assert.deepEqual(colorConfig.thresholds.map(threshold => ({
        min: threshold.min,
        max: threshold.max,
    })), [
        { min: 0, max: 20 },
        { min: 20, max: 90 },
        { min: 90, max: 101 },
    ]);
});

test("threshold colors use resolved appearance colors", () => {
    const colorConfig = buildMetricVisualSettings(buildAppearanceSettings({
        usageColors: {
            ...defaultAppearanceSettings.usageColors,
            lowColor: "#111111",
            mediumColor: "#222222",
            highColor: "#333333",
        },
    })).colorConfig;

    assert.deepEqual(colorConfig.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("line smoothing and grid options pass through resolved appearance settings", () => {
    const visualSettings = buildMetricVisualSettings(buildAppearanceSettings({
        lineSmoothingPercent: 95,
        gridLineVisibility: "always",
        gridLineType: "vertical",
    }));

    assert.equal(visualSettings.lineSmoothingPercent, 95);
    assert.equal(visualSettings.gridLineVisibility, "always");
    assert.equal(visualSettings.gridLineType, "vertical");
});

function buildAppearanceSettings(overrides: Partial<ResolvedAppearanceSettings> = {}): ResolvedAppearanceSettings {
    return {
        ...defaultAppearanceSettings,
        ...overrides,
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

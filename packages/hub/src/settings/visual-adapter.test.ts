import assert from "node:assert/strict";
import test from "node:test";
import { buildMetricVisualSettings } from "./visual-adapter";
import {
    defaultAppearanceSettings,
    type AppearanceSettings,
} from "./widget-settings";

test("graphic type maps normalized appearance settings to renderer names", () => {
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({ graphicType: "circular" })).graphicType, "circular");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({ graphicType: "linear" })).graphicType, "linear");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({ graphicType: "dashed-line" })).graphicType, "dashed-line");
});

test("circle style normalizes to curated presets", () => {
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({ circleStyle: "compact" })).circleStyle, "compact");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({ circleStyle: "gauge" })).circleStyle, "gauge");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        circleStyle: "unknown" as AppearanceSettings["circleStyle"],
    })).circleStyle, "value");
});

test("invalid graphic type falls back to circular", () => {
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        graphicType: "unsupported-graphic" as AppearanceSettings["graphicType"],
    })).graphicType, "circular");
});

test("graphic style resolves theme preset names with flat fallback", () => {
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        graphicStyle: "cupertino-glass",
    })).graphicStyle, "cupertino-glass");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        graphicStyle: "unknown" as AppearanceSettings["graphicStyle"],
    })).graphicStyle, "flat");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings()).graphicStyle, "flat");
});

test("solid color mode uses validated color with fallback", () => {
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        colorMode: "solid",
        solidColor: " #123456 ",
    })).colorConfig.solidColor, "#123456");
    assert.equal(buildMetricVisualSettings(buildAppearanceSettings({
        colorMode: "solid",
        solidColor: "not-a-color",
    })).colorConfig.solidColor, "#3b82f6");
});

test("threshold values are clamped and ordered", () => {
    const colorConfig = buildMetricVisualSettings(buildAppearanceSettings({
        lowThreshold: 90,
        highThreshold: 20,
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

test("threshold colors use normalized appearance colors", () => {
    const colorConfig = buildMetricVisualSettings(buildAppearanceSettings({
        colorLow: "#111111",
        colorMedium: "#222222",
        colorHigh: "#333333",
    })).colorConfig;

    assert.deepEqual(colorConfig.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("line smoothing and grid options normalize to supported values", () => {
    const highSettings = buildMetricVisualSettings(buildAppearanceSettings({
        lineSmoothingPercent: 120,
        gridLineVisibility: "always",
        gridLineType: "vertical",
    }));
    const defaultSettings = buildMetricVisualSettings(buildAppearanceSettings({
        lineSmoothingPercent: Number.NaN,
        gridLineVisibility: "unknown" as AppearanceSettings["gridLineVisibility"],
        gridLineType: "unknown" as AppearanceSettings["gridLineType"],
    }));

    assert.equal(highSettings.lineSmoothingPercent, 100);
    assert.equal(highSettings.gridLineVisibility, "always");
    assert.equal(highSettings.gridLineType, "vertical");
    assert.equal(defaultSettings.lineSmoothingPercent, 75);
    assert.equal(defaultSettings.gridLineVisibility, "adaptive");
    assert.equal(defaultSettings.gridLineType, "horizontal");
});

function buildAppearanceSettings(overrides: Partial<AppearanceSettings> = {}): AppearanceSettings {
    return {
        ...defaultAppearanceSettings,
        ...overrides,
    };
}

import assert from "node:assert/strict";
import test from "node:test";
import { resolveMetricVisualSettings } from "./metric-visual-settings";

test("graphic type aliases normalize legacy primitive names", () => {
    assert.equal(resolveMetricVisualSettings({ graphicType: "arc-gauge" }).graphicType, "circular");
    assert.equal(resolveMetricVisualSettings({ graphicType: "linear-bar" }).graphicType, "linear");
    assert.equal(resolveMetricVisualSettings({ graphicType: "sparkline" }).graphicType, "dashed-line");
});

test("invalid graphic type falls back to circular", () => {
    assert.equal(resolveMetricVisualSettings({ graphicType: "unknown" }).graphicType, "circular");
});

test("graphic style resolves theme preset names with flat fallback", () => {
    assert.equal(resolveMetricVisualSettings({ graphicStyle: "cupertino-glass" }).graphicStyle, "cupertino-glass");
    assert.equal(resolveMetricVisualSettings({ graphicStyle: "unknown" }).graphicStyle, "flat");
    assert.equal(resolveMetricVisualSettings({}).graphicStyle, "flat");
});

test("solid color mode uses validated color with fallback", () => {
    assert.equal(resolveMetricVisualSettings({
        colorMode: "solid",
        solidColor: " #123456 ",
    }).colorConfig.solidColor, "#123456");
    assert.equal(resolveMetricVisualSettings({
        colorMode: "solid",
        solidColor: "not-a-color",
    }).colorConfig.solidColor, "#3b82f6");
});

test("threshold values are clamped and ordered", () => {
    const colorConfig = resolveMetricVisualSettings({
        lowThreshold: 90,
        highThreshold: 20,
    }).colorConfig;

    assert.deepEqual(colorConfig.thresholds.map(threshold => ({
        min: threshold.min,
        max: threshold.max,
    })), [
        { min: 0, max: 20 },
        { min: 20, max: 90 },
        { min: 90, max: 101 },
    ]);
});

test("threshold colors use colorMid legacy fallback before default medium color", () => {
    const colorConfig = resolveMetricVisualSettings({
        colorLow: "#111111",
        colorMid: "#222222",
        colorHigh: "#333333",
    }).colorConfig;

    assert.deepEqual(colorConfig.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("line smoothing and grid options normalize to supported values", () => {
    const highSettings = resolveMetricVisualSettings({
        lineSmoothingPercent: 120,
        gridLineVisibility: "always",
        gridLineType: "vertical",
    });
    const defaultSettings = resolveMetricVisualSettings({
        lineSmoothingPercent: "not-a-number",
        gridLineVisibility: "unknown",
        gridLineType: "unknown",
    });

    assert.equal(highSettings.lineSmoothingPercent, 100);
    assert.equal(highSettings.gridLineVisibility, "always");
    assert.equal(highSettings.gridLineType, "vertical");
    assert.equal(defaultSettings.lineSmoothingPercent, 75);
    assert.equal(defaultSettings.gridLineVisibility, "adaptive");
    assert.equal(defaultSettings.gridLineType, "horizontal");
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildMetricVisualSettings } from "./visual-adapter";
import { buildSampleResolvedAppearanceSettings as buildAppearanceSettings } from "./sample-appearance-settings";

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
            ...buildAppearanceSettings().usageColors,
            solidColor: "#123456",
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#123456");
});

test("threshold values build renderer color bands", () => {
    const primaryMetric = buildMetricVisualSettings(buildAppearanceSettings({
        lowColorThresholdPercent: 20,
        highColorThresholdPercent: 90,
    })).paints.primaryMetric;

    assert.deepEqual(primaryMetric.thresholds.map(threshold => ({
        min: threshold.min,
        max: threshold.max,
    })), [
        { min: 0, max: 20 },
        { min: 20, max: 90 },
        { min: 90, max: 101 },
    ]);
});

test("threshold colors use resolved appearance colors", () => {
    const primaryMetric = buildMetricVisualSettings(buildAppearanceSettings({
        usageColors: {
            ...buildAppearanceSettings().usageColors,
            lowColor: "#111111",
            mediumColor: "#222222",
            highColor: "#333333",
        },
    })).paints.primaryMetric;

    assert.deepEqual(primaryMetric.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("black-white color mode lowers renderer paint to neutral colors", () => {
    const visualSettings = buildMetricVisualSettings(buildAppearanceSettings({
        colorMode: "black-white",
    }));

    assert.equal(visualSettings.paintConstraint, "black-white");
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
    });
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

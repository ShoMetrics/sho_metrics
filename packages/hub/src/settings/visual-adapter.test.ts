import assert from "node:assert/strict";
import test from "node:test";
import { buildMetricRenderAppearance } from "./visual-adapter";
import { buildDefaultAppearanceSettings as buildAppearanceSettings } from "./default-appearance-settings";

test("graphic type maps resolved appearance settings to renderer names", () => {
    const circularSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { viewLayout: "circular" } }));
    const linearSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { viewLayout: "linear" } }));
    const sparklineSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { viewLayout: "sparkline" } }));

    assert.equal(circularSettings.graphicType, "circular");
    assert.equal(linearSettings.graphicType, "linear");
    assert.equal(sparklineSettings.graphicType, "sparkline");
});

test("circle style maps resolved appearance settings to renderer presets", () => {
    const compactSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { circleStyle: "compact" } }));
    const gaugeSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { circleStyle: "gauge" } }));
    const valueSettings = buildMetricRenderAppearance(buildAppearanceSettings({ graph: { circleStyle: "value" } }));

    assert.equal(compactSettings.circleStyle, "compact");
    assert.equal(gaugeSettings.circleStyle, "gauge");
    assert.equal(valueSettings.circleStyle, "value");
});

test("graphic style maps resolved appearance settings to theme preset names", () => {
    const cupertinoGlassSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "cupertino-glass" },
    }));
    const colorFilledSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "color-filled" },
    }));
    const defaultSettings = buildMetricRenderAppearance(buildAppearanceSettings());

    assert.equal(cupertinoGlassSettings.graphicStyle, "cupertino-glass");
    assert.equal(colorFilledSettings.graphicStyle, "color-filled");
    assert.equal(defaultSettings.graphicStyle, "flat");
});

test("solid color mode uses resolved appearance color", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        metricColor: {
            colorMode: "solid",
            solid: {
                colors: { usageColor: "#123456" },
            },
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#123456");
});

test("threshold values build renderer color bands", () => {
    const primaryMetric = buildMetricRenderAppearance(buildAppearanceSettings({
        metricColor: {
            multiColor: {
                lowThresholdPercent: 20,
                highThresholdPercent: 90,
            },
        },
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
    const primaryMetric = buildMetricRenderAppearance(buildAppearanceSettings({
        metricColor: {
            multiColor: {
                colors: {
                    usage: {
                        lowColor: "#111111",
                        mediumColor: "#222222",
                        highColor: "#333333",
                    },
                },
            },
        },
    })).paints.primaryMetric;

    assert.deepEqual(primaryMetric.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("black-white color mode lowers renderer paint to neutral colors", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        metricColor: { colorMode: "black-white" },
    }));

    assert.equal(visualSettings.paintConstraint, "black-white");
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
        isGradientEnabled: false,
    });
});

test("color filled solid mode uses theme background color and neutral foreground paint", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
            colorFilled: {
                solid: { color: "#123456" },
            },
        },
        metricColor: {
            colorMode: "solid",
            solid: { colors: { usageColor: "#ef4444" } },
        },
    }));

    assert.deepEqual(visualSettings.paints.backgroundFill, {
        fillKind: "solid",
        color: "#123456",
        isGradientEnabled: true,
    });
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
        isGradientEnabled: false,
    });
});

test("color filled multi-color mode uses soft triangle colors without threshold positions", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
            colorFilled: {
                multiColor: {
                    colors: {
                        lowColor: "#111111",
                        mediumColor: "#222222",
                        highColor: "#333333",
                    },
                    isGradientEnabled: false,
                },
            },
        },
        metricColor: {
            multiColor: {
                lowThresholdPercent: 10,
                highThresholdPercent: 90,
            },
        },
    }));

    assert.deepEqual(visualSettings.paints.backgroundFill, {
        fillKind: "soft-triangle",
        lowColor: "#111111",
        mediumColor: "#222222",
        highColor: "#333333",
        isGradientEnabled: false,
    });
});

test("line smoothing and grid options pass through resolved appearance settings", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        sparkline: {
            lineSmoothingPercent: 95,
            gridLineVisibility: "always",
            gridLineType: "vertical",
        },
    }));

    assert.equal(visualSettings.lineSmoothingPercent, 95);
    assert.equal(visualSettings.gridLineVisibility, "always");
    assert.equal(visualSettings.gridLineType, "vertical");
});

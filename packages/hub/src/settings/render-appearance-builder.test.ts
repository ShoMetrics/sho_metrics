import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
    OLD_CRT_RENDER_GRAPHIC_EFFECT_TOKENS,
} from "../rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    OLD_CRT_RENDER_TEXT_STYLES,
} from "../rendering/render-text-style";
import { buildMetricRenderAppearance } from "./render-appearance-builder";
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
    const oldCrtSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "old-crt" },
    }));
    const defaultSettings = buildMetricRenderAppearance(buildAppearanceSettings());

    assert.equal(cupertinoGlassSettings.graphicStyle, "cupertino-glass");
    assert.equal(colorFilledSettings.graphicStyle, "color-filled");
    assert.equal(oldCrtSettings.graphicStyle, "old-crt");
    assert.equal(defaultSettings.graphicStyle, "flat");
});

test("text styles map resolved appearance settings to renderer text roles", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings());
    const oldCrtSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "old-crt" },
    }));

    assert.deepEqual(visualSettings.textStyles, DEFAULT_RENDER_TEXT_STYLES);
    assert.deepEqual(oldCrtSettings.textStyles, OLD_CRT_RENDER_TEXT_STYLES);
});

test("graphic effects map resolved appearance settings to renderer effect tokens", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings());
    const oldCrtSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "old-crt" },
    }));

    assert.deepEqual(visualSettings.graphicEffects, DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS);
    assert.deepEqual(oldCrtSettings.graphicEffects, OLD_CRT_RENDER_GRAPHIC_EFFECT_TOKENS);
});

test("solid color mode uses resolved appearance color", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        paint: {
            metric: {
                colorMode: "solid",
                solid: {
                    colors: { usageColor: "#123456" },
                },
            },
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#123456");
});

test("threshold values build renderer color bands", () => {
    const primaryMetric = buildMetricRenderAppearance(buildAppearanceSettings({
        paint: {
            metric: {
                multiColor: {
                    lowThresholdPercent: 20,
                    highThresholdPercent: 90,
                },
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
        paint: {
            metric: {
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
        paint: {
            metric: { colorMode: "black-white" },
        },
    }));

    assert.equal(visualSettings.paintConstraint, "black-white");
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
        isGradientEnabled: false,
    });
});

test("old crt theme uses fixed phosphor paint unless black-white mode is active", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "old-crt" },
        paint: {
            metric: {
                colorMode: "solid",
                solid: { colors: { usageColor: "#ef4444" } },
            },
        },
    }));
    const blackWhiteSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "old-crt" },
        paint: {
            metric: { colorMode: "black-white" },
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#10d82a");
    assert.equal(visualSettings.paints.primaryText, "#46ff36");
    assert.equal(visualSettings.paints.background, "#010301");
    assert.equal(blackWhiteSettings.paintConstraint, "black-white");
    assert.equal(blackWhiteSettings.paints.primaryMetric.solidColor, "#e6e6e6");
    assert.equal(blackWhiteSettings.paints.primaryText, "rgba(255,255,255,0.94)");
});

test("color filled solid mode uses theme background color and neutral foreground paint", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
        },
        paint: {
            metric: {
                colorMode: "solid",
                solid: { colors: { usageColor: "#ef4444" } },
            },
            colorFilled: {
                colorMode: "solid",
                solid: { color: "#123456" },
            },
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
        },
        paint: {
            metric: {
                multiColor: {
                    lowThresholdPercent: 10,
                    highThresholdPercent: 90,
                },
            },
            colorFilled: {
                colorMode: "multi-color",
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

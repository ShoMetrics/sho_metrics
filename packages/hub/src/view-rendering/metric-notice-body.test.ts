import assert from "node:assert/strict";
import test from "node:test";
import type { MetricRenderAppearance } from "./render-appearance";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "./render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES } from "./render-text-style";
import { renderMetricNoticeBody } from "./metric-notice-body";

test("metric notice body splits controlled two-word copy into two centered lines", () => {
    const svg = renderMetricNoticeBody({
        text: "Choose metric",
        visual: buildMetricRenderAppearance(),
        renderSize: { width: 144, height: 144 },
    });

    assert.match(svg, /metric-notice-line-0/);
    assert.match(svg, /metric-notice-line-1/);
    assert.match(svg, /text-anchor="middle"[\s\S]*>Choose<\/text>/);
    assert.match(svg, /text-anchor="middle"[\s\S]*>metric<\/text>/);
});

test("metric notice body renders single-word copy as one line", () => {
    const svg = renderMetricNoticeBody({
        text: "Offline",
        visual: buildMetricRenderAppearance(),
        renderSize: { width: 144, height: 144 },
    });

    assert.match(svg, /metric-notice-line-0/);
    assert.doesNotMatch(svg, /metric-notice-line-1/);
    assert.match(svg, />Offline<\/text>/);
});

test("metric notice body escapes text at the renderer boundary", () => {
    const svg = renderMetricNoticeBody({
        text: "Install <helper>",
        visual: buildMetricRenderAppearance(),
        renderSize: { width: 144, height: 144 },
    });

    assert.match(svg, />Install<\/text>/);
    assert.match(svg, />&lt;helper&gt;<\/text>/);
    assert.doesNotMatch(svg, /<helper>/);
});

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        renderPrimitive: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        themePreset: "flat",
        paintConstraint: "none",
        paints: {
            background: "#000",
            backgroundFill: undefined,
            surface: "#111",
            primaryText: "#fff",
            secondaryText: "#ccc",
            mutedText: "#888",
            icon: "#fff",
            barTitleText: "#fff",
            metricValueText: "#fff",
            barValueText: "#fff",
            barUnitText: "#ddd",
            barSecondaryText: "#bbb",
            primaryMetric: {
                mode: "solid",
                solidColor: "#00f",
                thresholds: [],
                isGradientEnabled: false,
            },
            track: "#222",
            grid: "#333",
            divider: "#444",
        },
        textStyles: DEFAULT_RENDER_TEXT_STYLES,
        themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    };
}

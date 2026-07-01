import assert from "node:assert/strict";
import { test } from "vitest";
import { renderDualMetricBodyView } from "./dual-metric-view";
import { DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS, type MetricRenderAppearance } from "../color/render-appearance";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "../rasterize/render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES } from "../rasterize/render-text-style";
import type { DualChannelWidgetData, WidgetData } from "../widget-data";

test("dual metric view renders the requested primitive branch", () => {
    const testCases = [
        { renderPrimitive: "sparkline" as const, expected: /dual-sparkline-positive-row/ },
        { renderPrimitive: "circle" as const, expected: /dual-arc-positive-row/ },
        { renderPrimitive: "text" as const, expected: /text-metric-positive-value/ },
    ];
    const visualSettings = buildMetricRenderAppearance();

    for (const testCase of testCases) {
        const svg = renderDualMetricBodyView({
            data: buildDualChannelData(),
            visual: visualSettings,
            renderPrimitive: testCase.renderPrimitive,
            renderSize: { width: 144, height: 144 },
            titleText: "Network",
            chartMode: "overlay",
            centerContent: "value",
            circleVariant: "full-ring",
            topIcon: "",
            positive: { labelText: "UP", unitText: "M", color: "#3b82f6" },
            negative: { labelText: "DN", unitText: "M", color: "#ef4444" },
        });

        assert.match(svg, testCase.expected);
    }
});

test("dual metric view dispatches text variants to centered and title-card renderers", () => {
    const centeredSvg = renderDualMetricBodyView({
        data: buildDualChannelData(),
        visual: {
            ...buildMetricRenderAppearance(),
            textVariant: "centered",
        },
        renderPrimitive: "text",
        renderSize: { width: 200, height: 100 },
        titleText: "NET",
        chartMode: "overlay",
        centerContent: "value",
        circleVariant: "full-ring",
        topIcon: "",
        positive: { labelText: "UP", unitText: "M", color: "#3b82f6" },
        negative: { labelText: "DN", unitText: "M", color: "#ef4444" },
    });
    const titleCardSvg = renderDualMetricBodyView({
        data: buildDualChannelData(),
        visual: {
            ...buildMetricRenderAppearance(),
            textVariant: "title-card",
        },
        renderPrimitive: "text",
        renderSize: { width: 200, height: 100 },
        titleText: "NET",
        chartMode: "overlay",
        centerContent: "value",
        circleVariant: "full-ring",
        topIcon: "",
        positive: { labelText: "UP", unitText: "M", color: "#3b82f6" },
        negative: { labelText: "DN", unitText: "M", color: "#ef4444" },
    });

    assert.match(centeredSvg, /text-metric-positive-value/);
    assert.doesNotMatch(centeredSvg, /title-card-dual-caption/);
    assert.match(titleCardSvg, /title-card-dual-caption/);
    assert.doesNotMatch(titleCardSvg, /text-metric-positive-value/);
});

test("dual title-card text keeps static text neutral", () => {
    const svg = renderDualMetricBodyView({
        data: {
            ...buildDualChannelData(),
            negative: {
                ...buildDualChannelData().negative,
                unit: "KB/s",
            },
        },
        visual: {
            ...buildMetricRenderAppearance(),
            textVariant: "title-card",
        },
        renderPrimitive: "text",
        renderSize: { width: 120, height: 120 },
        titleText: "NET",
        chartMode: "overlay",
        centerContent: "value",
        circleVariant: "full-ring",
        topIcon: "",
        positive: { labelText: "UP", unitText: "M", color: "#3b82f6" },
        negative: { labelText: "DN", unitText: "M", color: "#ef4444" },
    });

    assert.match(svg, /id="title-card-dual-code"[\s\S]*fill="#metric-value-text-token"/);
    assert.match(svg, /id="title-card-dual-caption-0"[\s\S]*fill="#metric-value-text-token"/);
    assert.doesNotMatch(svg, /fill="#3b82f6">NET/);
    assert.match(svg, /id="title-card-positive-value"[\s\S]*fill="#3b82f6"[\s\S]*>12<\/text>/);
    assert.match(svg, /id="title-card-negative-value"[\s\S]*fill="#ef4444"[\s\S]*>4<\/text>/);
});

test("dual text metric compacts data-rate units in the view layer", () => {
    const svg = renderDualMetricBodyView({
        data: buildDualChannelData(),
        visual: {
            ...buildMetricRenderAppearance(),
            textVariant: "centered",
        },
        renderPrimitive: "text",
        renderSize: { width: 200, height: 100 },
        titleText: "NET",
        chartMode: "overlay",
        centerContent: "value",
        circleVariant: "full-ring",
        topIcon: "",
        positive: { labelText: "UP", unitText: "MB/s", color: "#3b82f6" },
        negative: { labelText: "DN", unitText: "KB/s", color: "#ef4444" },
    });

    assert.match(svg, />M<\/text>/);
    assert.match(svg, />K<\/text>/);
    assert.doesNotMatch(svg, />MB\/s<\/text>/);
    assert.doesNotMatch(svg, />KB\/s<\/text>/);
});

test("direct dual circle metric preserves raw data-rate units", () => {
    const data = buildDualChannelData();
    const svg = renderDualMetricBodyView({
        data: {
            ...data,
            negative: {
                ...data.negative,
                unit: "KB/s",
            },
        },
        visual: buildMetricRenderAppearance(),
        renderPrimitive: "circle",
        renderSize: { width: 200, height: 100 },
        titleText: "NET",
        chartMode: "overlay",
        centerContent: "icon-value-unit",
        circleVariant: "gauge",
        topIcon: "",
        positive: { labelText: "UP", unitText: "MB/s", color: "#3b82f6" },
        negative: { labelText: "DN", unitText: "KB/s", color: "#ef4444" },
    });

    assert.match(svg, />MB\/s<\/text>/);
    assert.match(svg, />KB\/s<\/text>/);
});

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        renderPrimitive: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        themePreset: "flat",
        paintConstraint: "none",
        paints: {
            background: "#0f0f0f",
            backgroundFill: undefined,
            surface: "rgba(255,255,255,0.08)",
            primaryText: "rgba(255,255,255,0.94)",
            secondaryText: "rgba(255,255,255,0.72)",
            mutedText: "rgba(255,255,255,0.48)",
            icon: "rgba(255,255,255,0.88)",
            barTitleText: "rgba(255,255,255,0.88)",
            metricValueText: "#metric-value-text-token",
            barValueText: "white",
            barUnitText: "rgba(255,255,255,0.76)",
            barSecondaryText: "rgba(255,255,255,0.78)",
            primaryMetric: {
                mode: "solid",
                solidColor: "#3b82f6",
                thresholds: [],
                isGradientEnabled: true,
            },
            track: "rgba(255,255,255,0.14)",
            grid: "rgba(255,255,255,0.18)",
            divider: "rgba(255,255,255,0.18)",
        },
        textStyles: {
            ...DEFAULT_RENDER_TEXT_STYLES,
            value: {
                ...DEFAULT_RENDER_TEXT_STYLES.value,
                fontFamily: "Test Value Font",
            },
            unit: {
                ...DEFAULT_RENDER_TEXT_STYLES.unit,
                fontFamily: "Test Value Font",
            },
            label: {
                ...DEFAULT_RENDER_TEXT_STYLES.label,
                fontFamily: "Test Label Font",
            },
            smallLabel: {
                ...DEFAULT_RENDER_TEXT_STYLES.smallLabel,
                fontFamily: "Test Label Font",
            },
        },
        themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
        transparentSurface: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    };
}

function buildDualChannelData(): DualChannelWidgetData {
    return {
        positive: {
            ...buildWidgetData(),
            label: "Download",
            current: 12,
            history: [2, 6, 12],
            unit: "MB/s",
            displayValue: "12",
        },
        negative: {
            ...buildWidgetData(),
            label: "Upload",
            current: 4,
            history: [1, 2, 4],
            unit: "MB/s",
            displayValue: "4",
        },
    };
}


function buildWidgetData(): WidgetData {
    return {
        label: "Metric",
        current: 42,
        progress: 0.42,
        history: [10, 20, 42],
        unit: "%",
        displayValue: "42",
    };
}

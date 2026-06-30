import assert from "node:assert/strict";
import { test } from "vitest";
import { renderSingleMetricBodyView } from "./single-metric-view";
import { DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS, type MetricRenderAppearance } from "../color/render-appearance";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "../rasterize/render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES } from "../rasterize/render-text-style";
import type { WidgetData } from "../widget-data";

test("single metric view passes foreground paint tokens into bar widgets", () => {
    const svg = renderSingleMetricBodyView({
        data: {
            ...buildWidgetData(),
            barLabel: "CPU Load",
            barDisplayValue: "42",
            secondaryDisplayValue: "OK",
        },
        visual: {
            ...buildMetricRenderAppearance(),
            renderPrimitive: "bar",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        topIcon: "<path id=\"bar-icon\" />",
        circleVariant: "full-ring",
    });

    assert.match(svg, /color="#icon-token"/);
    assert.match(svg, /fill="#bar-title-text-token"[\s\S]*CPU Load/);
    assert.match(svg, /fill="#bar-value-text-token"[\s\S]*42/);
    assert.match(svg, /fill="#bar-unit-text-token"[\s\S]*%/);
    assert.match(svg, /fill="#bar-secondary-text-token"[\s\S]*OK/);
    assert.match(svg, /font-family="Test Label Font"/);
    assert.match(svg, /font-family="Test Value Font"/);
});

test("single metric view passes foreground paint tokens into sparkline widgets", () => {
    const svg = renderSingleMetricBodyView({
        data: buildWidgetData(),
        visual: {
            ...buildMetricRenderAppearance(),
            renderPrimitive: "sparkline",
            gridLineVisibility: "always",
            gridLineType: "vertical",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        topIcon: "<path id=\"sparkline-icon\" />",
        circleVariant: "full-ring",
    });

    assert.match(svg, /color="#icon-token"/);
    assert.match(svg, /fill="#secondary-text-token"[\s\S]*CPU/);
    assert.match(svg, /fill="#primary-text-token"[\s\S]*42/);
    assert.match(svg, /fill="#secondary-text-token"[\s\S]*%/);
    assert.match(svg, /fill="#surface-token"/);
    assert.match(svg, /stroke="#divider-token"/);
    assert.match(svg, /stroke="#grid-token"/);
    assert.match(svg, /fill="#muted-text-token"[\s\S]*s<\/text>/);
});

test("single metric view dispatches text variants to centered and title-card renderers", () => {
    const centeredSvg = renderSingleMetricBodyView({
        data: buildWidgetData(),
        visual: {
            ...buildMetricRenderAppearance(),
            renderPrimitive: "text",
            textVariant: "centered",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        circleVariant: "full-ring",
    });
    const titleCardSvg = renderSingleMetricBodyView({
        data: buildWidgetData(),
        visual: {
            ...buildMetricRenderAppearance(),
            renderPrimitive: "text",
            textVariant: "title-card",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        circleVariant: "full-ring",
    });

    assert.match(centeredSvg, /text-metric-label/);
    assert.doesNotMatch(centeredSvg, /title-card-code/);
    assert.match(titleCardSvg, /title-card-code/);
    assert.doesNotMatch(titleCardSvg, /text-metric-label/);
});

test("single title-card text uses the solid metric paint for static text", () => {
    const svg = renderSingleMetricBodyView({
        data: buildWidgetData(),
        visual: {
            ...buildMetricRenderAppearance(),
            renderPrimitive: "text",
            textVariant: "title-card",
        },
        renderSize: { width: 120, height: 120 },
        centerIcon: "<path id=\"center-icon\" />",
        circleVariant: "full-ring",
    });

    assert.match(svg, /fill="#metric-token"[\s\S]*CPU/);
});

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        renderPrimitive: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        themePreset: "flat",
        paintConstraint: "none",
        paints: {
            background: "#background-token",
            backgroundFill: undefined,
            surface: "#surface-token",
            primaryText: "#primary-text-token",
            secondaryText: "#secondary-text-token",
            mutedText: "#muted-text-token",
            icon: "#icon-token",
            barTitleText: "#bar-title-text-token",
            metricValueText: "#metric-value-text-token",
            barValueText: "#bar-value-text-token",
            barUnitText: "#bar-unit-text-token",
            barSecondaryText: "#bar-secondary-text-token",
            primaryMetric: {
                mode: "solid",
                solidColor: "#metric-token",
                thresholds: [],
                isGradientEnabled: false,
            },
            track: "#track-token",
            grid: "#grid-token",
            divider: "#divider-token",
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

function buildWidgetData(): WidgetData {
    return {
        label: "CPU",
        current: 42,
        progress: 0.42,
        history: [10, 25, 42],
        unit: "%",
        displayValue: "42",
        sampleTimestampMilliseconds: 1,
    };
}

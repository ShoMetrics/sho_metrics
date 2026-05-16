import assert from "node:assert/strict";
import test from "node:test";
import { renderSingleMetricBodyView } from "./single-metric-view";
import type { MetricRenderAppearance } from "./render-appearance";
import type { WidgetData } from "./widget-data";

test("single metric view passes foreground paint tokens into linear widgets", () => {
    const svg = renderSingleMetricBodyView({
        data: {
            ...buildWidgetData(),
            linearLabel: "CPU Load",
            linearDisplayValue: "42",
            secondaryDisplayValue: "OK",
        },
        visual: {
            ...buildMetricRenderAppearance(),
            graphicType: "linear",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        linearIcon: "<path id=\"linear-icon\" />",
        circleStyle: "value",
    });

    assert.match(svg, /color="#icon-token"/);
    assert.match(svg, /fill="#linear-title-text-token"[\s\S]*CPU Load/);
    assert.match(svg, /fill="#linear-value-text-token"[\s\S]*42/);
    assert.match(svg, /fill="#linear-unit-text-token"[\s\S]*%/);
    assert.match(svg, /fill="#linear-secondary-text-token"[\s\S]*OK/);
    assert.match(svg, /font-family="Test Label Font"/);
    assert.match(svg, /font-family="Test Value Font"/);
});

test("single metric view passes foreground paint tokens into sparkline widgets", () => {
    const svg = renderSingleMetricBodyView({
        data: buildWidgetData(),
        visual: {
            ...buildMetricRenderAppearance(),
            graphicType: "sparkline",
            gridLineVisibility: "always",
            gridLineType: "vertical",
        },
        renderSize: { width: 144, height: 144 },
        centerIcon: "<path id=\"center-icon\" />",
        linearIcon: "<path id=\"sparkline-icon\" />",
        circleStyle: "value",
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

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        graphicType: "circular",
        circleStyle: "value",
        graphicStyle: "flat",
        paintConstraint: "none",
        paints: {
            background: "#background-token",
            backgroundFill: undefined,
            surface: "#surface-token",
            primaryText: "#primary-text-token",
            secondaryText: "#secondary-text-token",
            mutedText: "#muted-text-token",
            icon: "#icon-token",
            linearTitleText: "#linear-title-text-token",
            linearValueText: "#linear-value-text-token",
            linearUnitText: "#linear-unit-text-token",
            linearSecondaryText: "#linear-secondary-text-token",
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
        typography: {
            labelFontFamily: "Test Label Font",
            valueFontFamily: "Test Value Font",
        },
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

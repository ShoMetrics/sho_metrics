import assert from "node:assert/strict";
import test from "node:test";
import { renderDualMetricBodyView } from "./dual-metric-view";
import type { MetricRenderAppearance } from "./render-appearance";
import type { DualChannelWidgetData, WidgetData } from "./widget-data";

test("dual metric view renders the requested primitive branch", () => {
    const testCases = [
        { graphicType: "sparkline" as const, expected: /dual-sparkline-positive-row/ },
        { graphicType: "circular" as const, expected: /dual-arc-positive-row/ },
        { graphicType: "text" as const, expected: /text-metric-positive-value/ },
    ];
    const visualSettings = buildMetricRenderAppearance();

    for (const testCase of testCases) {
        const svg = renderDualMetricBodyView({
            data: buildDualChannelData(),
            visual: visualSettings,
            graphicType: testCase.graphicType,
            renderSize: { width: 144, height: 144 },
            titleText: "Network",
            chartMode: "overlay",
            centerContent: "value",
            circleStyle: "value",
            topIcon: "",
            positive: { color: "#3b82f6" },
            negative: { color: "#ef4444" },
        });

        assert.match(svg, testCase.expected);
    }
});

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        graphicType: "circular",
        circleStyle: "value",
        graphicStyle: "flat",
        paintConstraint: "none",
        paints: {
            background: "#0f0f0f",
            backgroundFill: undefined,
            surface: "rgba(255,255,255,0.08)",
            primaryText: "rgba(255,255,255,0.94)",
            secondaryText: "rgba(255,255,255,0.72)",
            mutedText: "rgba(255,255,255,0.48)",
            icon: "rgba(255,255,255,0.88)",
            linearTitleText: "rgba(255,255,255,0.88)",
            linearValueText: "white",
            linearUnitText: "rgba(255,255,255,0.76)",
            linearSecondaryText: "rgba(255,255,255,0.78)",
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
        typography: {
            labelFontFamily: "Test Label Font",
            valueFontFamily: "Test Value Font",
        },
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

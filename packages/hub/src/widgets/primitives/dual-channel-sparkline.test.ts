import assert from "node:assert/strict";
import { test } from "vitest";
import type { DualChannelWidgetData, WidgetData } from "../../view-rendering/widget-data";
import {
    DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
    renderDualChannelSparkline,
} from "./dual-channel-sparkline";

test("mirrored sparkline renders a solid x axis without grid lines", () => {
    const svgFragment = renderDualChannelSparkline(buildDualChannelData(), {
        ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
        chartMode: "mirrored",
        gridLineVisibility: "always",
        gridLineType: "horizontal",
    }, { width: 144, height: 144 });

    assert.match(svgFragment, /dual-sparkline-positive-row/);
    assert.match(svgFragment, /dual-sparkline-negative-row/);
    assert.match(svgFragment, /stroke="rgba\(255,255,255,0\.24\)" stroke-width="1\.15" stroke-linecap="round"/);
    assert.doesNotMatch(svgFragment, /stroke-dasharray/);
});

test("wide overlay sparkline keeps value rows outside the chart area", () => {
    const svgFragment = renderDualChannelSparkline(buildDualChannelData(), {
        ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
        chartMode: "overlay",
        gridLineVisibility: "always",
        gridLineType: "vertical",
    }, { width: 200, height: 100 });

    assert.match(svgFragment, /<line x1="111" y1="40"/);
    assert.match(svgFragment, /<text x="30" y="48"/);
    assert.match(svgFragment, /<text x="30" y="70"/);
    assert.match(svgFragment, /<rect x="8" y="10\.40"\s+width="184"/);
});

test("overlay sparkline renders horizontal grid lines above channel fills", () => {
    const svgFragment = renderDualChannelSparkline(buildDualChannelData(), {
        ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
        chartMode: "overlay",
        gridLineVisibility: "always",
        gridLineType: "horizontal",
    }, { width: 144, height: 144 });
    const firstPositiveAreaFillIndex = svgFragment.indexOf(`fill="url(#dual-sparkline-positive-area-`);
    const firstGridLineStrokeIndex = svgFragment.indexOf(`stroke-opacity="1"`);
    const firstPositiveLineStrokeIndex = svgFragment.indexOf(`stroke="url(#dual-sparkline-positive-line-`);

    assert.ok(firstPositiveAreaFillIndex >= 0, "Expected positive area fill.");
    assert.ok(firstGridLineStrokeIndex > firstPositiveAreaFillIndex, "Expected grid lines after channel area fills.");
    assert.ok(firstPositiveLineStrokeIndex > firstGridLineStrokeIndex, "Expected metric lines after grid lines.");
});

test("dual-channel sparkline honors metric-specific display values", () => {
    const svgFragment = renderDualChannelSparkline({
        positive: buildWidgetData({
            label: "Download",
            current: 1,
            displayValue: "1",
        }),
        negative: buildWidgetData({
            label: "Upload",
            current: 1,
            displayValue: "1",
        }),
    }, {
        ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
        chartMode: "overlay",
    }, { width: 200, height: 100 });

    assert.match(svgFragment, />1</);
    assert.doesNotMatch(svgFragment, />1\.0</);
});

function buildDualChannelData(): DualChannelWidgetData {
    return {
        positive: buildWidgetData({
            label: "Upload",
            current: 8,
            displayValue: "8",
        }),
        negative: buildWidgetData({
            label: "Download",
            current: 24,
            displayValue: "24",
        }),
    };
}

function buildWidgetData(options: {
    label: string;
    current: number;
    displayValue: string;
}): WidgetData {
    return {
        label: options.label,
        current: options.current,
        displayValue: options.displayValue,
        progress: 0,
        history: [0, options.current / 2, options.current],
        unit: "KB/s",
    };
}

import assert from "node:assert/strict";
import test from "node:test";
import type { DualChannelWidgetData, WidgetData } from "../../rendering/widget-data";
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
    }, { width: 200, height: 100 });

    assert.match(svgFragment, /<line x1="84" y1="40"/);
    assert.match(svgFragment, /<text x="30" y="48"/);
    assert.match(svgFragment, /<text x="30" y="70"/);
    assert.match(svgFragment, /<rect x="8" y="10\.40"\s+width="184"/);
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

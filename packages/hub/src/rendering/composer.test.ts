import assert from "node:assert/strict";
import test from "node:test";
import type { DualChannelWidgetData, WidgetData } from "./widget-data";
import { composeDualChannelSvg, composeSvg } from "./composer";

test("composer wraps a single widget with the selected key size and flat style", () => {
    const svg = composeSvg(buildWidgetData(), {
        graphicType: "linear",
        graphicStyle: "flat",
        colorConfig: {
            mode: "solid",
            solidColor: "#123456",
            thresholds: [],
        },
    }, { width: 144, height: 144 });

    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /width="144" height="144"/);
    assert.match(svg, /viewBox="0 0 144 144"/);
    assert.match(svg, /linear-progress/);
    assert.match(svg, /#123456/);
});

test("composer applies muted filter around the widget fragment", () => {
    const svg = composeSvg(buildWidgetData(), {
        graphicType: "circular",
        graphicStyle: "flat",
        muted: true,
    }, { width: 100, height: 100 });

    assert.match(svg, /filter id="muted-widget-100-100"/);
    assert.match(svg, /<g filter="url\(#muted-widget-100-100\)"/);
    assert.match(svg, /<feColorMatrix type="saturate" values="0" \/>/);
});

test("dual-channel composer renders the dual sparkline instead of a single widget", () => {
    const svg = composeDualChannelSvg(buildDualChannelData(), {
        graphicStyle: "flat",
        configOverrides: {
            chartMode: "overlay",
        },
    }, { width: 200, height: 100 });

    assert.match(svg, /width="200" height="100"/);
    assert.match(svg, /dual-sparkline-positive-row/);
    assert.match(svg, /dual-sparkline-negative-row/);
});

test("composer renders the pure text widget when selected", () => {
    const svg = composeSvg(buildWidgetData(), {
        graphicType: "text",
        graphicStyle: "flat",
    }, { width: 144, height: 144 });

    assert.match(svg, /text-metric-value/);
    assert.doesNotMatch(svg, /Arc Gauge: track/);
});

test("dual-channel composer renders the circular dual-channel gauge when requested", () => {
    const svg = composeDualChannelSvg(buildDualChannelData(), {
        graphicType: "circular",
        graphicStyle: "flat",
        configOverrides: {
            centerContent: "value",
            positiveColor: "#3b82f6",
            negativeColor: "#ef4444",
        },
    }, { width: 144, height: 144 });

    assert.match(svg, /width="144" height="144"/);
    assert.match(svg, /dual-arc-positive-row/);
    assert.match(svg, /dual-arc-negative-row/);
    assert.doesNotMatch(svg, /dual-sparkline-positive-row/);
});

test("dual-channel composer renders the dual text widget when requested", () => {
    const svg = composeDualChannelSvg(buildDualChannelData(), {
        graphicType: "text",
        graphicStyle: "flat",
    }, { width: 144, height: 144 });

    assert.match(svg, /text-metric-positive-value/);
    assert.match(svg, /text-metric-negative-value/);
    assert.doesNotMatch(svg, /dual-sparkline-positive-row/);
});

test("composer rejects mirrored traffic when single-channel data is passed", () => {
    assert.throws(() => composeSvg(buildWidgetData(), {
        graphicType: "mirrored-traffic",
        graphicStyle: "flat",
    }, { width: 144, height: 144 }), /Mirrored traffic requires dual-channel widget data/);
});

function buildWidgetData(): WidgetData {
    return {
        label: "CPU",
        current: 42,
        progress: 0.42,
        history: [10, 20, 42],
        unit: "%",
        displayValue: "42",
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

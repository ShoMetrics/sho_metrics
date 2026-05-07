import assert from "node:assert/strict";
import test from "node:test";
import type { DualChannelWidgetData, WidgetData } from "../../rendering/widget-data";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG } from "./arc-gauge";
import { buildGaugeRangeColorPlan } from "./arc-gauge-range";
import { linearBar, DEFAULT_LINEAR_BAR_CONFIG } from "./linear-bar";
import { renderMetricTextRow } from "./metric-text-row";
import { DEFAULT_MIRRORED_TRAFFIC_CONFIG, renderMirroredTraffic } from "./mirrored-traffic";
import { DEFAULT_TEXT_METRIC_CONFIG, renderDualTextMetric, textMetric } from "./text-metric";

const keySize = { width: 144, height: 144 };

test("arc gauge clamps progress and escapes center text", () => {
    const svgFragment = arcGauge.render({
        ...buildWidgetData(),
        label: "CPU",
        displayValue: `<42>`,
        unit: `% & C`,
        progress: 1.5,
    }, DEFAULT_ARC_GAUGE_CONFIG, keySize);

    assert.match(svgFragment, /Arc Gauge: track/);
    assert.match(svgFragment, /Arc Gauge: progress arc/);
    assert.match(svgFragment, /&lt;42&gt;/);
    assert.match(svgFragment, /% &amp; C/);
    assert.doesNotMatch(svgFragment, /stroke-dashoffset="-/);
});

test("linear bar clamps fill width and renders secondary text safely", () => {
    const svgFragment = linearBar.render({
        ...buildWidgetData(),
        label: "Disk",
        current: 75,
        progress: 2,
        secondaryDisplayValue: `C:\\ <System>`,
    }, DEFAULT_LINEAR_BAR_CONFIG, keySize);

    assert.match(svgFragment, /linear-progress-750-144-144/);
    assert.match(svgFragment, /width="114"/);
    assert.match(svgFragment, /C:\\ &lt;System&gt;/);
});

test("text metric renders a pure text layout without a ring", () => {
    const svgFragment = textMetric.render({
        ...buildWidgetData(),
        label: `<CPU>`,
        displayValue: `<42>`,
        secondaryDisplayValue: `Ryzen & Threadripper`,
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize);

    assert.match(svgFragment, /text-metric-label/);
    assert.match(svgFragment, /&lt;CPU&gt;/);
    assert.match(svgFragment, /&lt;42&gt;/);
    assert.match(svgFragment, /fill="#3b82f6"/);
    assert.match(svgFragment, /Ryzen &amp; Threadripper/);
    assert.doesNotMatch(svgFragment, /Arc Gauge: track/);
});

test("gauge circle style opens the bottom arc and renders a marker dot", () => {
    const svgFragment = arcGauge.render(buildWidgetData(), {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        centerIconFragment: "<path />",
    }, keySize);

    assert.match(svgFragment, /arc-gauge-marker/);
    assert.match(svgFragment, /arc-gauge-range-segment/);
    assert.doesNotMatch(svgFragment, /mask id="arc-gauge-marker-gap-/);
    assert.doesNotMatch(svgFragment, /fill="black"/);
    assert.doesNotMatch(svgFragment, /class="arc-gauge-marker"[^>]+stroke=/);
    assert.doesNotMatch(svgFragment, /stroke-dasharray="284\.[0-9]+ 89\.[0-9]+"/);
});

test("gauge circle style uses semantic range bands for dynamic colors", () => {
    const svgFragment = arcGauge.render({
        ...buildWidgetData(),
        current: 50,
        progress: 0.5,
    }, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        colorConfig: {
            mode: "threshold",
            solidColor: "#000000",
            thresholds: [
                { min: 0, max: 30, color: "#00ff00" },
                { min: 30, max: 70, color: "#ffff00" },
                { min: 70, max: 101, color: "#ff0000" },
            ],
        },
    }, keySize);

    assert.equal((svgFragment.match(/class="arc-gauge-range-segment"/g)?.length ?? 0) > 2, true);
    assert.match(svgFragment, /fill="#00ff00"/);
    assert.match(svgFragment, /fill="#ffff00"/);
    assert.match(svgFragment, /fill="#ff0000"/);
    assert.match(svgFragment, /fill="url\(#arc-gauge-range-/);
    assert.match(svgFragment, /class="arc-gauge-marker"[^>]+fill="#ffff00"/);
});

test("gauge circle style moves blend ranges with custom dynamic thresholds", () => {
    const colorPlan = buildGaugeRangeColorPlan({
        circleStyle: "gauge",
        baseColor: "#000000",
        progress: 0.6,
        gradientHeadAdjustmentPercent: -42,
        gaugeRangeBlendProgress: DEFAULT_ARC_GAUGE_CONFIG.gaugeRangeBlendProgress,
        colorConfig: {
            mode: "threshold",
            solidColor: "#000000",
            thresholds: [
                { min: 0, max: 50, color: "#111111" },
                { min: 50, max: 70, color: "#777777" },
                { min: 70, max: 101, color: "#eeeeee" },
            ],
        },
    });

    assert.deepEqual(colorPlan.stops.map(stop => ({
        offset: Number(stop.offset.toFixed(2)),
        color: stop.color,
    })), [
        { offset: 0, color: "#111111" },
        { offset: 0.42, color: "#111111" },
        { offset: 0.58, color: "#777777" },
        { offset: 0.62, color: "#777777" },
        { offset: 0.78, color: "#eeeeee" },
        { offset: 1, color: "#eeeeee" },
    ]);
});

test("gauge circle style keeps the range track uncolored while data is unavailable", () => {
    const svgFragment = arcGauge.render({
        ...buildWidgetData(),
        displayValue: "N/A",
        progress: 0,
    }, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        centerIconFragment: "<path />",
    }, keySize);

    assert.doesNotMatch(svgFragment, /arc-gauge-marker/);
    assert.equal(svgFragment.match(/stroke-dasharray="284\.[0-9]+ 89\.[0-9]+"/g)?.length, 1);
});

test("linear bar renders at most two channel bars", () => {
    const svgFragment = linearBar.render({
        ...buildWidgetData(),
        linearChannels: [
            buildLinearChannel("Read", "R"),
            buildLinearChannel("Write", "W"),
            buildLinearChannel("Ignored", "I"),
        ],
    }, DEFAULT_LINEAR_BAR_CONFIG, keySize);

    assert.match(svgFragment, /linear-channel-0-value/);
    assert.match(svgFragment, /linear-channel-1-value/);
    assert.doesNotMatch(svgFragment, /linear-channel-2-value/);
});

test("metric text row escapes values and clamps non-finite coordinates", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric:value",
        valueText: `<N/A>`,
        unitText: `MB/s &`,
        xCoordinate: Number.POSITIVE_INFINITY,
        yCoordinate: Number.NaN,
        width: -100,
        valueFontSize: 20,
        unitFontSize: 12,
        fontFamily: `"Inter"`,
        valueFontWeight: 900,
        unitFontWeight: 700,
        valueFill: `#fff"`,
        unitFill: "#aaa",
    });

    assert.match(svgFragment, /clipPath id="metric-value"/);
    assert.match(svgFragment, /width="1"/);
    assert.match(svgFragment, /x="0" y="0"/);
    assert.match(svgFragment, /&lt;N\/A&gt;/);
    assert.match(svgFragment, /MB\/s &amp;/);
});

test("metric text row shrinks long values and units into the row width", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric-long-value",
        valueText: "999.9",
        unitText: "MB/s",
        xCoordinate: 16,
        yCoordinate: 61,
        width: 48,
        valueFontSize: 24,
        unitFontSize: 14,
        fontFamily: "Inter",
        valueFontWeight: 900,
        unitFontWeight: 800,
        valueFill: "white",
        unitFill: "#aaa",
    });

    assert.match(svgFragment, /textLength="48" lengthAdjust="spacingAndGlyphs"/);
    assert.match(svgFragment, /font-size="18\.[0-9]+"/);
});

test("mirrored traffic renders labels, center line, and both channel graphs", () => {
    const svgFragment = renderMirroredTraffic(buildDualChannelData(), DEFAULT_MIRRORED_TRAFFIC_CONFIG, keySize);

    assert.match(svgFragment, /Mirrored Traffic: labels/);
    assert.match(svgFragment, /Mirrored Traffic: center line/);
    assert.match(svgFragment, /Mirrored Traffic: positive/);
    assert.match(svgFragment, /Mirrored Traffic: negative/);
    assert.match(svgFragment, /mirrored-pos-/);
    assert.match(svgFragment, /mirrored-neg-/);
});

test("dual text metric renders two escaped value rows", () => {
    const svgFragment = renderDualTextMetric({
        positive: {
            ...buildWidgetData(),
            label: `<UP>`,
            displayValue: "12",
        },
        negative: {
            ...buildWidgetData(),
            label: `<DOWN>`,
            displayValue: "4",
        },
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize);

    assert.match(svgFragment, /text-metric-positive-value/);
    assert.match(svgFragment, /text-metric-negative-value/);
    assert.match(svgFragment, /&lt;UP&gt;/);
    assert.match(svgFragment, /&lt;DOWN&gt;/);
});

function buildWidgetData(): WidgetData {
    return {
        current: 42,
        progress: 0.42,
        history: [10, 20, 42],
        unit: "%",
        label: "CPU",
        displayValue: "42",
    };
}

function buildLinearChannel(label: string, displayValue: string): NonNullable<WidgetData["linearChannels"]>[number] {
    return {
        label,
        displayValue,
        unit: "MB/s",
        progress: 0.5,
        color: "#123456",
        iconFragment: "<path d=\"M0 0\" />",
    };
}

function buildDualChannelData(): DualChannelWidgetData {
    return {
        positive: {
            ...buildWidgetData(),
            current: 24,
            history: [4, 12, 24],
            unit: "MB/s",
        },
        negative: {
            ...buildWidgetData(),
            current: 12,
            history: [2, 6, 12],
            unit: "MB/s",
        },
    };
}

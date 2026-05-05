import assert from "node:assert/strict";
import test from "node:test";
import type { DualChannelWidgetData, WidgetData } from "../../rendering/widget-data";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG } from "./arc-gauge";
import { linearBar, DEFAULT_LINEAR_BAR_CONFIG } from "./linear-bar";
import { renderMetricTextRow } from "./metric-text-row";
import { DEFAULT_MIRRORED_TRAFFIC_CONFIG, renderMirroredTraffic } from "./mirrored-traffic";

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

test("mirrored traffic renders labels, center line, and both channel graphs", () => {
    const svgFragment = renderMirroredTraffic(buildDualChannelData(), DEFAULT_MIRRORED_TRAFFIC_CONFIG, keySize);

    assert.match(svgFragment, /Mirrored Traffic: labels/);
    assert.match(svgFragment, /Mirrored Traffic: center line/);
    assert.match(svgFragment, /Mirrored Traffic: positive/);
    assert.match(svgFragment, /Mirrored Traffic: negative/);
    assert.match(svgFragment, /mirrored-pos-/);
    assert.match(svgFragment, /mirrored-neg-/);
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

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS } from "../../rendering/render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES } from "../../rendering/render-text-style";
import type { DualChannelWidgetData, WidgetData } from "../../rendering/widget-data";
import { arcGauge, DEFAULT_ARC_GAUGE_CONFIG } from "./arc-gauge";
import { buildGaugeRangeColorPlan, resolveGaugeMarkerGap, resolveGaugeMarkerRenderProgress } from "./arc-gauge-range";
import { DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG, renderDualChannelArcGauge } from "./dual-channel-arc-gauge";
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

test("gauge circle style puts the label and direction icon at the bottom", () => {
    const svgFragment = arcGauge.render({
        ...buildWidgetData(),
        label: "NET",
    }, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        footerIconFragment: "<path id=\"direction-icon\" />",
    }, keySize);

    assert.match(svgFragment, /arc-gauge-bottom-label/);
    assert.match(svgFragment, /NET/);
    assert.match(svgFragment, /direction-icon/);
    assert.doesNotMatch(svgFragment, /id="arc-label"/);
});

test("gauge circle style keeps value and unit in fixed regions", () => {
    const singleDigitFragment = renderGaugeValueSample("3", "KB/s");
    const doubleDigitFragment = renderGaugeValueSample("70", "KB/s");
    const tripleDigitFragment = renderGaugeValueSample("552", "KB/s");
    const shortUnitSingleDigitFragment = renderGaugeValueSample("3", "%");
    const shortUnitDoubleDigitFragment = renderGaugeValueSample("38", "%");
    const shortUnitTripleDigitFragment = renderGaugeValueSample("301", "W");
    const longUnitManyDigitFragment = renderGaugeValueSample("1234", "ms");

    assert.match(singleDigitFragment, /id="arc-gauge-value"/);
    assert.match(singleDigitFragment, /id="arc-gauge-unit"/);
    assert.match(singleDigitFragment, /x="74"/);
    assert.match(singleDigitFragment, /x="85"/);
    assert.match(singleDigitFragment, /font-size="43"/);
    assert.match(singleDigitFragment, /font-size="13"/);
    assert.match(doubleDigitFragment, /x="74"/);
    assert.match(doubleDigitFragment, /x="85"/);
    assert.match(doubleDigitFragment, /font-size="37"/);
    assert.match(doubleDigitFragment, /font-size="13"/);
    assert.match(tripleDigitFragment, /x="74"/);
    assert.match(tripleDigitFragment, /x="85"/);
    assert.match(tripleDigitFragment, /font-size="25"/);
    assert.match(tripleDigitFragment, /font-size="13"/);
    assert.match(shortUnitSingleDigitFragment, /x="72"/);
    assert.match(shortUnitSingleDigitFragment, /x="97"/);
    assert.match(shortUnitSingleDigitFragment, /font-size="48"/);
    assert.match(shortUnitDoubleDigitFragment, /x="66"/);
    assert.match(shortUnitDoubleDigitFragment, /x="97"/);
    assert.match(shortUnitDoubleDigitFragment, /font-size="48"/);
    assert.match(shortUnitTripleDigitFragment, /x="92"/);
    assert.match(shortUnitTripleDigitFragment, /x="97"/);
    assert.match(shortUnitTripleDigitFragment, /font-size="31"/);
    assert.match(longUnitManyDigitFragment, /x="74"/);
    assert.match(longUnitManyDigitFragment, /x="85"/);
    assert.match(longUnitManyDigitFragment, /font-size="21"/);
    assert.doesNotMatch(singleDigitFragment, /arc-gauge-value-unit/);
    assert.doesNotMatch(singleDigitFragment, /textLength=/);
    assert.doesNotMatch(doubleDigitFragment, /textLength=/);
    assert.doesNotMatch(tripleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitSingleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitDoubleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitTripleDigitFragment, /textLength=/);
});

test("gauge circle style uses semantic range bands for range colors", () => {
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
            isGradientEnabled: true,
        },
    }, keySize);

    assert.equal((svgFragment.match(/class="arc-gauge-range-segment"/g)?.length ?? 0) > 2, true);
    assert.match(svgFragment, /fill="#00ff00"/);
    assert.match(svgFragment, /fill="#ffff00"/);
    assert.match(svgFragment, /fill="#ff0000"/);
    assert.match(svgFragment, /fill="url\(#arc-gauge-range-/);
    assert.match(svgFragment, /class="arc-gauge-marker"[^>]+fill="#ffff00"/);
});

test("gauge circle style moves blend ranges with custom range thresholds", () => {
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
            isGradientEnabled: true,
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
    assert.doesNotMatch(svgFragment, /arc-gauge-range-segment/);
    assert.match(svgFragment, /stroke-dasharray="/);
});

test("gauge marker uses a conservative visual range without changing true endpoints", () => {
    const startProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 0,
        gapLength: 4,
        visibleLength: 100,
    }));
    const nearStartProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 0.01,
        gapLength: 4,
        visibleLength: 100,
    }));
    const middleProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 0.5,
        gapLength: 4,
        visibleLength: 100,
    }));
    const nearEndProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 0.96,
        gapLength: 4,
        visibleLength: 100,
    }));
    const endProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 1,
        gapLength: 4,
        visibleLength: 100,
    }));

    assert.equal(startProgress, 0);
    assert.equal(nearStartProgress, 0.1274);
    assert.equal(middleProgress, 0.49);
    assert.equal(nearEndProgress, 0.8304);
    assert.equal(endProgress, 1);
});

test("gauge marker visual range still honors the minimum geometric gap", () => {
    const markerProgress = roundMarkerProgress(resolveGaugeMarkerRenderProgress({
        progress: 0.01,
        gapLength: 20,
        visibleLength: 100,
    }));

    assert.equal(markerProgress, 0.2842);
});

test("gauge marker gap only cuts the marker travel domain for non-endpoint values", () => {
    const nearEndMarkerGap = roundMarkerGap(resolveGaugeMarkerGap({
        progress: 0.8304,
        gapLength: 4,
        visibleLength: 100,
    }));
    const nearStartMarkerGap = roundMarkerGap(resolveGaugeMarkerGap({
        progress: 0.1274,
        gapLength: 4,
        visibleLength: 100,
    }));
    const endpointMarkerGap = roundMarkerGap(resolveGaugeMarkerGap({
        progress: 1,
        gapLength: 4,
        visibleLength: 100,
    }));

    assert.deepEqual(nearEndMarkerGap, {
        startProgress: 0.7904,
        endProgress: 0.8704,
    });
    assert.deepEqual(nearStartMarkerGap, {
        startProgress: 0.0874,
        endProgress: 0.1674,
    });
    assert.deepEqual(endpointMarkerGap, {
        startProgress: 0.96,
        endProgress: 1,
    });
});

test("dual-channel gauge style renders two full-color gauge lanes with marker dots", () => {
    const svgFragment = renderDualChannelArcGauge({
        positive: {
            ...buildWidgetData(),
            current: 0,
            progress: 0,
            displayValue: "0",
            unit: "KB/s",
        },
        negative: {
            ...buildWidgetData(),
            current: 6,
            progress: 0.6,
            displayValue: "6",
            unit: "KB/s",
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        titleText: "NETWORK",
        positiveColor: "#ef4444",
        negativeColor: "#3b82f6",
        positiveColorConfig: {
            mode: "threshold",
            solidColor: "#ef4444",
            thresholds: [
                { min: 0, max: 30, color: "#111111" },
                { min: 30, max: 70, color: "#222222" },
                { min: 70, max: 101, color: "#333333" },
            ],
            isGradientEnabled: true,
        },
        negativeColorConfig: {
            mode: "threshold",
            solidColor: "#3b82f6",
            thresholds: [
                { min: 0, max: 30, color: "#44ff44" },
                { min: 30, max: 70, color: "#ff8800" },
                { min: 70, max: 101, color: "#00aaff" },
            ],
            isGradientEnabled: true,
        },
        positiveIconFragment: "<path id=\"upload-icon\" />",
        negativeIconFragment: "<path id=\"download-icon\" />",
    }, keySize);

    assert.match(svgFragment, /dual-arc-positive-range-/);
    assert.match(svgFragment, /dual-arc-negative-range-/);
    assert.match(svgFragment, /class="dual-arc-gauge-positive-segment"/);
    assert.match(svgFragment, /class="dual-arc-gauge-negative-segment"/);
    assert.match(svgFragment, /class="dual-arc-gauge-positive-marker"/);
    assert.match(svgFragment, /class="dual-arc-gauge-negative-marker"/);
    assert.match(svgFragment, /#44ff44/);
    assert.match(svgFragment, /#ff8800/);
    assert.match(svgFragment, /#00aaff/);
    assert.match(svgFragment, /upload-icon/);
    assert.match(svgFragment, /download-icon/);
    assert.match(svgFragment, /dual-arc-gauge-positive-row-value/);
    assert.match(svgFragment, /dual-arc-gauge-negative-row-value/);
    assert.match(svgFragment, /x="76\.76"[\s\S]*>0<\/text>/);
    assert.match(svgFragment, /font-size="12"[\s\S]*>KB\/s<\/text>/);
    assert.match(svgFragment, /dual-arc-gauge-bottom-label/);
    assert.match(svgFragment, /NET/);
    assert.doesNotMatch(svgFragment, /NETWORK/);
    assert.doesNotMatch(svgFragment, /stroke="rgba\(255,255,255,0\.14\)"/);
});

test("dual-channel gauge style keeps long row values out of icon space", () => {
    const svgFragment = renderDualChannelArcGauge({
        positive: {
            ...buildWidgetData(),
            current: 34,
            progress: 0.34,
            displayValue: "34",
            unit: "KB/s",
        },
        negative: {
            ...buildWidgetData(),
            current: 328,
            progress: 0.8,
            displayValue: "328",
            unit: "KB/s",
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        titleText: "NETWORK",
        positiveIconFragment: "<path id=\"upload-icon\" />",
        negativeIconFragment: "<path id=\"download-icon\" />",
    }, keySize);

    assert.match(svgFragment, /id="dual-arc-gauge-negative-row-value"/);
    assert.match(svgFragment, /font-size="13\.50"[^>]*>328<\/text>/);
    assert.match(svgFragment, /id="dual-arc-gauge-negative-row-unit"/);
    assert.match(svgFragment, /download-icon/);
});

test("dual-channel gauge style uses a safe single-row placeholder for unavailable values", () => {
    const svgFragment = renderDualChannelArcGauge({
        positive: {
            ...buildWidgetData(),
            displayValue: "N/A",
            unit: "KB/s",
        },
        negative: {
            ...buildWidgetData(),
            displayValue: "N/A",
            unit: "KB/s",
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
        titleText: "NETWORK",
        positiveIconFragment: "<path id=\"upload-icon\" />",
        negativeIconFragment: "<path id=\"download-icon\" />",
    }, keySize);

    assert.match(svgFragment, /id="dual-arc-gauge-positive-row-value"/);
    assert.match(svgFragment, /id="dual-arc-gauge-negative-row-value"/);
    assert.match(svgFragment, /text-anchor="start"/);
    assert.doesNotMatch(svgFragment, /dual-arc-gauge-positive-row-unit/);
    assert.doesNotMatch(svgFragment, /dual-arc-gauge-negative-row-unit/);
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
        valueFontFamily: `"Inter"`,
        unitFontFamily: `"Inter"`,
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
        valueFontFamily: "Inter",
        unitFontFamily: "Inter",
        valueFontWeight: 900,
        unitFontWeight: 800,
        valueFill: "white",
        unitFill: "#aaa",
    });

    assert.match(svgFragment, /textLength="48" lengthAdjust="spacingAndGlyphs"/);
    assert.match(svgFragment, /font-size="18\.[0-9]+"/);
});

test("mirrored traffic renders labels, center line, and both channel graphs", () => {
    const svgFragment = renderMirroredTraffic(buildDualChannelData(), {
        ...DEFAULT_MIRRORED_TRAFFIC_CONFIG,
        textStyles: {
            ...DEFAULT_RENDER_TEXT_STYLES,
            smallLabel: {
                ...DEFAULT_RENDER_TEXT_STYLES.smallLabel,
                fontFamily: "Traffic Label Font",
                filter: "url(#label-glow)",
            },
        },
        graphicEffects: {
            ...DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
            metricFilter: "url(#metric-glow)",
            subtleFilter: "url(#subtle-glow)",
        },
    }, keySize);

    assert.match(svgFragment, /Mirrored Traffic: labels/);
    assert.match(svgFragment, /Mirrored Traffic: center line/);
    assert.match(svgFragment, /Mirrored Traffic: positive/);
    assert.match(svgFragment, /Mirrored Traffic: negative/);
    assert.match(svgFragment, /mirrored-pos-/);
    assert.match(svgFragment, /mirrored-neg-/);
    assert.match(svgFragment, /font-family="Traffic Label Font"/);
    assert.match(svgFragment, /filter="url\(#label-glow\)"/);
    assert.match(svgFragment, /filter="url\(#metric-glow\)"/);
    assert.match(svgFragment, /filter="url\(#subtle-glow\)"/);
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

function renderGaugeValueSample(displayValue: string, unit: string): string {
    return arcGauge.render({
        ...buildWidgetData(),
        displayValue,
        unit,
    }, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        circleStyle: "gauge",
    }, keySize);
}

function roundMarkerProgress(progress: number): number {
    return Number(progress.toFixed(4));
}

function roundMarkerGap(markerGap: ReturnType<typeof resolveGaugeMarkerGap>): ReturnType<typeof resolveGaugeMarkerGap> {
    return {
        startProgress: roundMarkerProgress(markerGap.startProgress),
        endProgress: roundMarkerProgress(markerGap.endProgress),
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

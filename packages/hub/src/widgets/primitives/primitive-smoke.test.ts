import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "../../view-rendering/render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES, PIXEL_RENDER_TEXT_STYLES } from "../../view-rendering/render-text-style";
import type { DualChannelWidgetData, WidgetData } from "../../view-rendering/widget-data";
import { progressCircle, DEFAULT_PROGRESS_CIRCLE_CONFIG } from "./progress-circle";
import { buildGaugeRangeColorPlan, resolveGaugeMarkerGap, resolveGaugeMarkerRenderProgress } from "./progress-circle-range";
import { DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG, renderDualChannelProgressCircle } from "./dual-channel-progress-circle";
import { progressBar, DEFAULT_PROGRESS_BAR_CONFIG } from "./progress-bar";
import { renderMetricTextRow } from "./metric-text-row";
import { DEFAULT_MIRRORED_TRAFFIC_CONFIG, renderMirroredTraffic } from "./mirrored-traffic";
import {
    DEFAULT_TEXT_METRIC_CONFIG,
    renderCenteredDualTextMetric,
    renderCenteredTextMetric,
} from "./text-metric";
import { renderTitleCardDualTextMetric, renderTitleCardTextMetric } from "./title-card-text-metric";

const keySize = { width: 144, height: 144 };

test("progress circle clamps progress and escapes center text", () => {
    const svgFragment = progressCircle.render({
        ...buildWidgetData(),
        label: "CPU",
        displayValue: `<42>`,
        unit: `% & C`,
        progress: 1.5,
    }, DEFAULT_PROGRESS_CIRCLE_CONFIG, keySize);

    assert.match(svgFragment, /Arc Gauge: track/);
    assert.match(svgFragment, /Arc Gauge: progress arc/);
    assert.match(svgFragment, /&lt;42&gt;/);
    assert.match(svgFragment, /% &amp; C/);
    assert.doesNotMatch(svgFragment, /stroke-dashoffset="-/);
});

test("progress bar clamps fill width and renders secondary text safely", () => {
    const svgFragment = progressBar.render({
        ...buildWidgetData(),
        label: "Disk",
        current: 75,
        progress: 2,
        secondaryDisplayValue: `C:\\ <System>`,
    }, DEFAULT_PROGRESS_BAR_CONFIG, keySize);

    assert.match(svgFragment, /progress-bar-750-144-144/);
    assert.match(svgFragment, /width="114"/);
    assert.match(svgFragment, /C:\\ &lt;System&gt;/);
});

test("text metric renders a pure text layout without a ring", () => {
    const svgFragment = renderCenteredTextMetric({
        ...buildWidgetData(),
        label: `<CPU>`,
        displayValue: `<42>`,
        secondaryDisplayValue: `Ryzen & Threadripper`,
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize);

    assert.match(svgFragment, /text-metric-label/);
    assert.match(svgFragment, /&lt;CPU&gt;/);
    assert.match(svgFragment, /&lt;42&gt;/);
    assert.match(svgFragment, /text-metric-unit/);
    assert.match(svgFragment, /id="text-metric-label"[\s\S]*y="23\.04"/);
    assert.match(svgFragment, /id="text-metric-value"[\s\S]*y="77\.76"/);
    assert.match(svgFragment, /id="text-metric-unit"[\s\S]*y="125\.28"/);
    assert.match(svgFragment, /fill="#e6e6e6"/);
    assert.doesNotMatch(svgFragment, /Ryzen &amp; Threadripper/);
    assert.doesNotMatch(svgFragment, /text-metric-secondary/);
    assert.doesNotMatch(svgFragment, /Arc Gauge: track/);
});

test("text metric forwards outline tokens to text helpers", () => {
    const svgFragment = renderCenteredTextMetric(buildWidgetData(), {
        ...DEFAULT_TEXT_METRIC_CONFIG,
        textOutline: { color: "#000000", strength: 0.85 },
    }, keySize);

    assert.match(svgFragment, /stroke="#000000"/);
    assert.match(svgFragment, /stroke-opacity="0\.85"/);
    assert.match(svgFragment, /paint-order="stroke fill"/);
});

test("text metric uses a horizontal touch strip layout for wide keys", () => {
    const svgFragment = renderCenteredTextMetric({
        ...buildWidgetData(),
        label: "CPU",
        displayValue: "67",
        unit: "%",
    }, DEFAULT_TEXT_METRIC_CONFIG, { width: 200, height: 100 });

    assert.match(svgFragment, /id="text-metric-label"[\s\S]*x="14" y="52"/);
    assert.match(svgFragment, /id="text-metric-value"[\s\S]*x="112(?:\.00)?" y="56(?:\.00)?"/);
    assert.match(svgFragment, /id="text-metric-unit"[\s\S]*x="186" y="68"[\s\S]*text-anchor="end"/);
});

test("title-card text metric renders supplied asymmetrical caption content", () => {
    const svgFragment = renderTitleCardTextMetric({
        ...buildWidgetData(),
        label: "CPU",
        displayValue: "23",
        unit: "%",
    }, {
        ...DEFAULT_TEXT_METRIC_CONFIG,
    }, keySize, {
        codeText: "CPU",
        compactCodeText: "CPU",
        threeCharacterCaptionText: "使用率",
        unitText: "%",
    });

    assert.match(svgFragment, /title-card-code/);
    assert.match(svgFragment, />CPU<\/text>/);
    assert.match(svgFragment, />使<\/text>/);
    assert.match(svgFragment, />用<\/text>/);
    assert.match(svgFragment, />率<\/text>/);
    assert.match(svgFragment, /id="title-card-value"[\s\S]*>23<\/text>/);
    assert.match(svgFragment, /id="title-card-unit"[\s\S]*>%<\/text>/);
    assert.doesNotMatch(svgFragment, /title-card-secondary/);
    assert.doesNotMatch(svgFragment, /text-metric-label/);
});

test("title-card text metric gives square edge values a left clip guard", () => {
    for (const displayValue of ["9", "91", "999", "N/A"]) {
        const svgFragment = renderTitleCardTextMetric({
            ...buildWidgetData(),
            displayValue,
        }, {
            ...DEFAULT_TEXT_METRIC_CONFIG,
        }, { width: 120, height: 120 }, {
            codeText: "CPU",
            compactCodeText: "CPU",
            threeCharacterCaptionText: "使用率",
            unitText: "%",
        });

        assert.match(svgFragment, new RegExp(`>${displayValue.replace("/", "\\/")}<\\/text>`, "u"));
        assert.equal(readConstrainedTextClipWidth(svgFragment, "title-card-value"), 65);
    }
});

test("title-card text metric uses a wide title layout", () => {
    const svgFragment = renderTitleCardTextMetric({
        ...buildWidgetData(),
        label: "GPU",
        displayValue: "54",
        unit: "C",
    }, {
        ...DEFAULT_TEXT_METRIC_CONFIG,
    }, { width: 200, height: 100 }, {
        codeText: "GPU",
        compactCodeText: "GPU",
        threeCharacterCaptionText: "温度計",
        unitText: "°C",
    });

    assert.doesNotMatch(svgFragment, /title-card-caption-text/);
    assert.match(svgFragment, />温<\/text>/);
    assert.match(svgFragment, />度<\/text>/);
    assert.match(svgFragment, />計<\/text>/);
    assert.match(svgFragment, />G<\/text>/);
    assert.match(svgFragment, />P<\/text>/);
    assert.match(svgFragment, />U<\/text>/);
    assert.match(svgFragment, /id="title-card-unit"[\s\S]*>°C<\/text>/);
});

test("title-card text metric renders only the three contracted caption rows", () => {
    const svgFragment = renderTitleCardTextMetric(buildWidgetData(), {
        ...DEFAULT_TEXT_METRIC_CONFIG,
    }, keySize, {
        codeText: "CPU",
        compactCodeText: "CPU",
        threeCharacterCaptionText: "ABCD",
        unitText: "%",
    });

    assert.equal(readTitleCardCaptionText(svgFragment, "title-card-caption"), "ABC");
    assert.doesNotMatch(svgFragment, />D<\/text>/);
});

test("gauge circle variant opens the bottom arc and renders a marker dot", () => {
    const svgFragment = progressCircle.render(buildWidgetData(), {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
        centerIconFragment: "<path />",
    }, keySize);

    assert.match(svgFragment, /progress-circle-marker/);
    assert.match(svgFragment, /progress-circle-range-segment/);
    assert.doesNotMatch(svgFragment, /mask id="progress-circle-marker-gap-/);
    assert.doesNotMatch(svgFragment, /fill="black"/);
    assert.doesNotMatch(svgFragment, /class="progress-circle-marker"[^>]+stroke=/);
    assert.doesNotMatch(svgFragment, /stroke-dasharray="284\.[0-9]+ 89\.[0-9]+"/);
});

test("gauge circle variant puts the label and direction icon at the bottom", () => {
    const svgFragment = progressCircle.render({
        ...buildWidgetData(),
        label: "NET",
    }, {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
        footerIconFragment: "<path id=\"direction-icon\" />",
    }, keySize);

    assert.match(svgFragment, /progress-circle-bottom-label/);
    assert.match(svgFragment, /NET/);
    assert.match(svgFragment, /direction-icon/);
    assert.doesNotMatch(svgFragment, /id="arc-label"/);
});

test("gauge circle variant keeps value and unit in fixed regions", () => {
    const singleDigitFragment = renderGaugeValueSample("3", "KB/s");
    const doubleDigitFragment = renderGaugeValueSample("70", "KB/s");
    const tripleDigitFragment = renderGaugeValueSample("552", "KB/s");
    const shortUnitSingleDigitFragment = renderGaugeValueSample("3", "%");
    const shortUnitDoubleDigitFragment = renderGaugeValueSample("38", "%");
    const shortUnitTripleDigitFragment = renderGaugeValueSample("301", "W");
    const longUnitManyDigitFragment = renderGaugeValueSample("1234", "ms");

    assert.match(singleDigitFragment, /id="progress-circle-value"/);
    assert.match(singleDigitFragment, /id="progress-circle-unit"/);
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
    assert.doesNotMatch(singleDigitFragment, /progress-circle-value-unit/);
    assert.doesNotMatch(singleDigitFragment, /textLength=/);
    assert.doesNotMatch(doubleDigitFragment, /textLength=/);
    assert.doesNotMatch(tripleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitSingleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitDoubleDigitFragment, /textLength=/);
    assert.doesNotMatch(shortUnitTripleDigitFragment, /textLength=/);
});

test("gauge circle variant uses semantic range bands for range colors", () => {
    const svgFragment = progressCircle.render({
        ...buildWidgetData(),
        current: 50,
        progress: 0.5,
    }, {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
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

    assert.equal((svgFragment.match(/class="progress-circle-range-segment"/g)?.length ?? 0) > 2, true);
    assert.match(svgFragment, /fill="#00ff00"/);
    assert.match(svgFragment, /fill="#ffff00"/);
    assert.match(svgFragment, /fill="#ff0000"/);
    assert.match(svgFragment, /fill="url\(#progress-circle-range-/);
    assert.match(svgFragment, /class="progress-circle-marker"[^>]+fill="#ffff00"/);
});

test("gauge circle variant moves blend ranges with custom range thresholds", () => {
    const colorPlan = buildGaugeRangeColorPlan({
        circleVariant: "gauge",
        baseColor: "#000000",
        progress: 0.6,
        gradientHeadAdjustmentPercent: -42,
        gaugeRangeBlendProgress: DEFAULT_PROGRESS_CIRCLE_CONFIG.gaugeRangeBlendProgress,
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

test("gauge circle variant keeps the range track uncolored while data is unavailable", () => {
    const svgFragment = progressCircle.render({
        ...buildWidgetData(),
        displayValue: "N/A",
        progress: 0,
    }, {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
        centerIconFragment: "<path />",
    }, keySize);

    assert.doesNotMatch(svgFragment, /progress-circle-marker/);
    assert.doesNotMatch(svgFragment, /progress-circle-range-segment/);
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

test("dual-channel full-ring variant mirrors channel progress from the bottom lanes", () => {
    const svgFragment = renderDualChannelProgressCircle({
        positive: {
            ...buildWidgetData(),
            progress: 0.5,
        },
        negative: {
            ...buildWidgetData(),
            progress: 0.5,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "full-ring",
        positiveColor: "#ff5500",
        negativeColor: "#0055ff",
    }, keySize);
    const uploadArc = readStrokeCircleElement(svgFragment, "#ff5500");
    const downloadArc = readStrokeCircleElement(svgFragment, "#0055ff");

    assert.equal(uploadArc.rotationDegrees, 95);
    assert.equal(downloadArc.rotationDegrees, -2.5);
});

test("dual-channel full-ring variant uses flush track joins", () => {
    const svgFragment = renderDualChannelProgressCircle({
        positive: {
            ...buildWidgetData(),
            progress: 0,
        },
        negative: {
            ...buildWidgetData(),
            progress: 0,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "full-ring",
        trackColor: "#444444",
    }, keySize);
    const trackArcs = readStrokeCircleElements(svgFragment, "#444444");

    assert.equal(trackArcs.length, 2);
    assert.deepEqual(trackArcs.map(arc => arc.lineCap), ["butt", "butt"]);
});

test("dual-channel full-ring variant keeps tiny nonzero progress visible", () => {
    const svgFragment = renderDualChannelProgressCircle({
        positive: {
            ...buildWidgetData(),
            progress: 0.001,
        },
        negative: {
            ...buildWidgetData(),
            progress: 0.001,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "full-ring",
        positiveColor: "#ff5500",
        negativeColor: "#0055ff",
    }, keySize);
    const uploadArc = readStrokeCircleElement(svgFragment, "#ff5500");
    const downloadArc = readStrokeCircleElement(svgFragment, "#0055ff");
    const uploadLength = readDashArrayFirstLength(uploadArc.dashArray);
    const downloadLength = readDashArrayFirstLength(downloadArc.dashArray);

    assert.equal(uploadArc.lineCap, "round");
    assert.equal(downloadArc.lineCap, "round");
    assert.match(svgFragment, /clipPath id="dual-progress-circle-positive-clip"/);
    assert.match(svgFragment, /clipPath id="dual-progress-circle-negative-clip"/);
    assert.match(svgFragment, /clip-path="url\(#dual-progress-circle-positive-clip\)"[\s\S]*stroke="#ff5500"/);
    assert.match(svgFragment, /clip-path="url\(#dual-progress-circle-negative-clip\)"[\s\S]*stroke="#0055ff"/);
    assert.equal(uploadArc.rotationDegrees, 95);
    assert.ok(uploadLength >= 15 && uploadLength <= 18);
    assert.ok(downloadLength >= 15 && downloadLength <= 18);
    assert.ok(downloadArc.rotationDegrees > 65);
    assert.ok(downloadArc.rotationDegrees < 75);
});

test("dual-channel gauge variant renders two full-color gauge lanes with marker dots", () => {
    const svgFragment = renderDualChannelProgressCircle({
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
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
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
    assert.match(svgFragment, /class="dual-progress-circle-positive-segment"/);
    assert.match(svgFragment, /class="dual-progress-circle-negative-segment"/);
    assert.match(svgFragment, /class="dual-progress-circle-positive-marker"/);
    assert.match(svgFragment, /class="dual-progress-circle-negative-marker"/);
    assert.match(svgFragment, /#44ff44/);
    assert.match(svgFragment, /#ff8800/);
    assert.match(svgFragment, /#00aaff/);
    assert.match(svgFragment, /upload-icon/);
    assert.match(svgFragment, /download-icon/);
    assert.match(svgFragment, /dual-progress-circle-positive-row-value/);
    assert.match(svgFragment, /dual-progress-circle-negative-row-value/);
    assert.match(svgFragment, /x="76\.76"[\s\S]*>0<\/text>/);
    assert.match(svgFragment, /font-size="12"[\s\S]*>KB\/s<\/text>/);
    assert.match(svgFragment, /dual-progress-circle-bottom-label/);
    assert.match(svgFragment, /NET/);
    assert.doesNotMatch(svgFragment, /NETWORK/);
    assert.doesNotMatch(svgFragment, /stroke="rgba\(255,255,255,0\.14\)"/);
});

test("dual-channel gauge variant moves the right-side marker from bottom toward top", () => {
    const lowProgressFragment = renderDualChannelProgressCircle({
        positive: buildWidgetData(),
        negative: {
            ...buildWidgetData(),
            progress: 0,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
    }, keySize);
    const highProgressFragment = renderDualChannelProgressCircle({
        positive: buildWidgetData(),
        negative: {
            ...buildWidgetData(),
            progress: 1,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
    }, keySize);

    const lowProgressXCoordinate = readCircleCoordinate(
        lowProgressFragment,
        "dual-progress-circle-negative-marker",
        "cx",
    );
    const lowProgressYCoordinate = readCircleCoordinate(
        lowProgressFragment,
        "dual-progress-circle-negative-marker",
        "cy",
    );
    const highProgressXCoordinate = readCircleCoordinate(
        highProgressFragment,
        "dual-progress-circle-negative-marker",
        "cx",
    );
    const highProgressYCoordinate = readCircleCoordinate(
        highProgressFragment,
        "dual-progress-circle-negative-marker",
        "cy",
    );

    assert.ok(lowProgressXCoordinate > keySize.width / 2);
    assert.ok(highProgressXCoordinate > keySize.width / 2);
    assert.ok(lowProgressYCoordinate > keySize.height / 2);
    assert.ok(highProgressYCoordinate < keySize.height / 2);
});

test("dual-channel gauge variant mirrors right-side range colors", () => {
    const svgFragment = renderDualChannelProgressCircle({
        positive: buildWidgetData(),
        negative: {
            ...buildWidgetData(),
            progress: 0.6,
        },
    }, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
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
    }, keySize);
    const negativeCaps = readCircleElements(svgFragment, "dual-progress-circle-negative-cap");
    const topCap = negativeCaps.reduce((top, cap) => cap.yCoordinate < top.yCoordinate ? cap : top);
    const bottomCap = negativeCaps.reduce((bottom, cap) => cap.yCoordinate > bottom.yCoordinate ? cap : bottom);

    assert.equal(topCap.fill, "#00aaff");
    assert.equal(bottomCap.fill, "#44ff44");
});

test("dual-channel gauge variant keeps long row values out of icon space", () => {
    const svgFragment = renderDualChannelProgressCircle({
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
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
        titleText: "NETWORK",
        positiveIconFragment: "<path id=\"upload-icon\" />",
        negativeIconFragment: "<path id=\"download-icon\" />",
    }, keySize);

    assert.match(svgFragment, /id="dual-progress-circle-negative-row-value"/);
    assert.match(svgFragment, /font-size="13\.50"[^>]*>328<\/text>/);
    assert.match(svgFragment, /id="dual-progress-circle-negative-row-unit"/);
    assert.match(svgFragment, /download-icon/);
});

test("dual-channel gauge variant uses a safe single-row placeholder for unavailable values", () => {
    const svgFragment = renderDualChannelProgressCircle({
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
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
        titleText: "NETWORK",
        positiveIconFragment: "<path id=\"upload-icon\" />",
        negativeIconFragment: "<path id=\"download-icon\" />",
    }, keySize);

    assert.match(svgFragment, /id="dual-progress-circle-positive-row-value"/);
    assert.match(svgFragment, /id="dual-progress-circle-negative-row-value"/);
    assert.match(svgFragment, /text-anchor="start"/);
    assert.doesNotMatch(svgFragment, /dual-progress-circle-positive-row-unit/);
    assert.doesNotMatch(svgFragment, /dual-progress-circle-negative-row-unit/);
});

test("progress bar renders at most two channel bars", () => {
    const svgFragment = progressBar.render({
        ...buildWidgetData(),
        barChannels: [
            buildProgressBarChannel("Read", "R"),
            buildProgressBarChannel("Write", "W"),
            buildProgressBarChannel("Ignored", "I"),
        ],
    }, DEFAULT_PROGRESS_BAR_CONFIG, keySize);

    assert.match(svgFragment, /progress-bar-channel-0-value/);
    assert.match(svgFragment, /progress-bar-channel-1-value/);
    assert.doesNotMatch(svgFragment, /progress-bar-channel-2-value/);
});

test("progress bar renders single value icon", () => {
    const svgFragment = progressBar.render({
        ...buildWidgetData(),
        barValueIconFragment: "<path id=\"direction-icon\" />",
        barValueIconColor: "#38bdf8",
    }, DEFAULT_PROGRESS_BAR_CONFIG, keySize);

    assert.match(svgFragment, /direction-icon/);
    assert.match(svgFragment, /color="#38bdf8"/);
    assert.match(svgFragment, /progress-bar-single-value/);
});

test("metric text row escapes values and clamps non-finite coordinates", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric:value",
        layout: {
            xCoordinate: Number.POSITIVE_INFINITY,
            yCoordinate: Number.NaN,
            width: -100,
        },
        value: {
            text: `<N/A>`,
            baseFontSize: 20,
            textStyle: {
                ...DEFAULT_RENDER_TEXT_STYLES.value,
                fontFamily: `"Inter"`,
                fontWeight: 900,
            },
            fill: `#fff"`,
        },
        unit: {
            text: `MB/s &`,
            baseFontSize: 12,
            textStyle: {
                ...DEFAULT_RENDER_TEXT_STYLES.unit,
                fontFamily: `"Inter"`,
                fontWeight: 700,
            },
            fill: "#aaa",
        },
    });

    assert.match(svgFragment, /clipPath id="metric-value"/);
    assert.match(svgFragment, /width="1"/);
    assert.match(svgFragment, /x="0" y="0"/);
    assert.match(svgFragment, /&lt;N\/A&gt;/);
    assert.match(svgFragment, /MB\/s &amp;/);
});

test("metric text row emits shared outline attributes when enabled", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric-outlined-value",
        layout: {
            xCoordinate: 16,
            yCoordinate: 61,
            width: 120,
        },
        value: {
            text: "42",
            baseFontSize: 24,
            textStyle: DEFAULT_RENDER_TEXT_STYLES.value,
            fill: "white",
        },
        unit: {
            text: "%",
            baseFontSize: 14,
            textStyle: DEFAULT_RENDER_TEXT_STYLES.unit,
            fill: "#aaa",
        },
        outline: { color: "#000000", strength: 0.85 },
    });

    assert.match(svgFragment, /stroke="#000000"/);
    assert.match(svgFragment, /stroke-opacity="0\.85"/);
    assert.match(svgFragment, /paint-order="stroke fill"/);
});

test("metric text row shrinks long values and units into the row width", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric-long-value",
        layout: {
            xCoordinate: 16,
            yCoordinate: 61,
            width: 48,
        },
        value: {
            text: "999.9",
            baseFontSize: 24,
            textStyle: {
                ...DEFAULT_RENDER_TEXT_STYLES.value,
                fontFamily: "Inter",
                fontWeight: 900,
            },
            fill: "white",
        },
        unit: {
            text: "MB/s",
            baseFontSize: 14,
            textStyle: {
                ...DEFAULT_RENDER_TEXT_STYLES.unit,
                fontFamily: "Inter",
                fontWeight: 800,
            },
            fill: "#aaa",
        },
    });

    assert.match(svgFragment, /textLength="48" lengthAdjust="spacingAndGlyphs"/);
    assert.match(svgFragment, /font-size="18\.[0-9]+"/);
});

test("metric text row keeps pixel unit text inside the shifted clip box", () => {
    const svgFragment = renderMetricTextRow({
        id: "metric-pixel-row",
        layout: {
            xCoordinate: 16,
            yCoordinate: 61,
            width: 120,
        },
        value: {
            text: "999",
            baseFontSize: 24,
            textStyle: PIXEL_RENDER_TEXT_STYLES.value,
            fill: "white",
        },
        unit: {
            text: "MB/s",
            baseFontSize: 14,
            textStyle: PIXEL_RENDER_TEXT_STYLES.unit,
            fill: "#aaa",
        },
    });

    assert.match(svgFragment, /DotGothic16/);
    assert.match(svgFragment, /y="61\.48"/);
    assert.match(svgFragment, /dy="0\.51"/);
    assert.match(svgFragment, /height="34\.80"/);
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
        themeEffects: {
            ...DEFAULT_RENDER_THEME_EFFECT_TOKENS,
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
    const svgFragment = renderCenteredDualTextMetric({
        positive: {
            ...buildWidgetData(),
            label: `Positive Source`,
            displayValue: "12",
        },
        negative: {
            ...buildWidgetData(),
            label: `Negative Source`,
            displayValue: "4",
        },
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize, {
        titleText: "GPU",
        positive: {
            labelText: "P0",
            unitText: "U0",
        },
        negative: {
            labelText: "P1",
            unitText: "U1",
        },
    });

    assert.match(svgFragment, /text-metric-positive-value/);
    assert.match(svgFragment, /text-metric-negative-value/);
    assert.match(svgFragment, /text-metric-dual-title/);
    assert.match(svgFragment, />GPU<\/text>/);
    assert.match(svgFragment, />P0<\/text>/);
    assert.match(svgFragment, />P1<\/text>/);
    assert.match(svgFragment, />U0<\/text>/);
    assert.match(svgFragment, />U1<\/text>/);
    assert.doesNotMatch(svgFragment, />NET<\/text>/);
});

test("dual text metric uses aligned compact rate rows for wide keys", () => {
    const svgFragment = renderCenteredDualTextMetric({
        positive: {
            ...buildWidgetData(),
            label: "UP",
            displayValue: "12",
            unit: "MB/s",
        },
        negative: {
            ...buildWidgetData(),
            label: "DOWN",
            displayValue: "4",
            unit: "MB/s",
        },
    }, DEFAULT_TEXT_METRIC_CONFIG, { width: 200, height: 100 }, {
        titleText: "NET",
        positive: {
            labelText: "UP",
            unitText: "M",
        },
        negative: {
            labelText: "DN",
            unitText: "M",
        },
    });

    assert.match(svgFragment, /id="text-metric-dual-title"[\s\S]*x="14" y="52"[\s\S]*>NET<\/text>/);
    assert.match(svgFragment, /id="text-metric-positive-label"[\s\S]*x="54" y="36"[\s\S]*>UP<\/text>/);
    assert.match(svgFragment, /id="text-metric-negative-label"[\s\S]*x="54" y="68"[\s\S]*>DN<\/text>/);
    assert.match(svgFragment, /id="text-metric-positive-value"[\s\S]*x="156" y="36"[\s\S]*text-anchor="end"/);
    assert.match(svgFragment, /id="text-metric-negative-value"[\s\S]*x="156" y="68"[\s\S]*text-anchor="end"/);
    assert.match(svgFragment, /id="text-metric-positive-unit"[\s\S]*x="186" y="42"[\s\S]*text-anchor="end"[\s\S]*>M<\/text>/);
    assert.match(svgFragment, /id="text-metric-negative-unit"[\s\S]*x="186" y="74"[\s\S]*text-anchor="end"[\s\S]*>M<\/text>/);
});

test("dual text metric keeps square rate rows inside symmetric padding", () => {
    const svgFragment = renderCenteredDualTextMetric({
        positive: {
            ...buildWidgetData(),
            label: "UP",
            displayValue: "999",
            unit: "MB/s",
        },
        negative: {
            ...buildWidgetData(),
            label: "DOWN",
            displayValue: "1000",
            unit: "GB/s",
        },
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize, {
        titleText: "NET",
        positive: {
            labelText: "UP",
            unitText: "M",
        },
        negative: {
            labelText: "DN",
            unitText: "G",
        },
    });

    assert.match(svgFragment, /id="text-metric-positive-label"[\s\S]*x="14"[\s\S]*>UP<\/text>/);
    assert.match(svgFragment, /id="text-metric-positive-value"[\s\S]*x="108"[\s\S]*text-anchor="end"[\s\S]*>999<\/text>/);
    assert.match(svgFragment, /id="text-metric-negative-value"[\s\S]*x="108"[\s\S]*text-anchor="end"[\s\S]*>1000<\/text>/);
    assert.match(svgFragment, /id="text-metric-positive-unit"[\s\S]*x="130"[\s\S]*y="73\.24"[\s\S]*text-anchor="end"[\s\S]*>M<\/text>/);
    assert.match(svgFragment, /id="text-metric-negative-unit"[\s\S]*x="130"[\s\S]*y="112\.12"[\s\S]*text-anchor="end"[\s\S]*>G<\/text>/);
});

test("dual text metric uses disk read and write abbreviations", () => {
    const svgFragment = renderCenteredDualTextMetric({
        positive: {
            ...buildWidgetData(),
            label: "READ",
            displayValue: "1",
            unit: "GB/s",
        },
        negative: {
            ...buildWidgetData(),
            label: "WRIT",
            displayValue: "512",
            unit: "KB/s",
        },
    }, DEFAULT_TEXT_METRIC_CONFIG, keySize, {
        titleText: "DISK",
        positive: {
            labelText: "RD",
            unitText: "G",
        },
        negative: {
            labelText: "WR",
            unitText: "K",
        },
    });

    assert.match(svgFragment, />DISK<\/text>/);
    assert.match(svgFragment, />RD<\/text>/);
    assert.match(svgFragment, />WR<\/text>/);
    assert.match(svgFragment, /id="text-metric-positive-unit"[\s\S]*>G<\/text>/);
    assert.match(svgFragment, /id="text-metric-negative-unit"[\s\S]*>K<\/text>/);
});

test("title-card dual text metric renders compact channel rows", () => {
    const svgFragment = renderTitleCardDualTextMetric(buildDualChannelData(), {
        ...DEFAULT_TEXT_METRIC_CONFIG,
    }, { width: 200, height: 100 }, {
        codeText: "NET",
        compactCodeText: "NET",
        threeCharacterCaptionText: "転送速",
        positiveLabelText: "↑",
        positiveUnitText: "M",
        negativeLabelText: "↓",
        negativeUnitText: "M",
    });

    assert.match(svgFragment, /title-card-dual-caption/);
    assert.equal(readTitleCardCaptionText(svgFragment, "title-card-dual-caption"), "転送速");
    assert.match(svgFragment, /id="title-card-positive-label"[\s\S]*>↑<\/text>/);
    assert.match(svgFragment, /id="title-card-negative-label"[\s\S]*>↓<\/text>/);
    assert.match(svgFragment, /id="title-card-positive-value"/);
    assert.match(svgFragment, /id="title-card-negative-value"/);
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

function readTitleCardCaptionText(svgFragment: string, captionIdPrefix: string): string {
    const captionMatches = [...svgFragment.matchAll(new RegExp(
        `id="${captionIdPrefix}-(\\d+)"[\\s\\S]*?<text\\b[\\s\\S]*?>([^<]+)<\\/text>`,
        "gu",
    ))];

    return captionMatches
        .sort((left, right) => Number(left[1]) - Number(right[1]))
        .map(match => match[2] ?? "")
        .join("");
}

function readConstrainedTextClipWidth(svgFragment: string, textId: string): number {
    const match = new RegExp(
        `<clipPath id="${textId}">[\\s\\S]*?<rect\\b[\\s\\S]*?width="([^"]+)"`,
        "u",
    ).exec(svgFragment);

    assert.ok(match?.[1], `missing clip width for ${textId}`);

    return Number(match[1]);
}

function renderGaugeValueSample(displayValue: string, unit: string): string {
    return progressCircle.render({
        ...buildWidgetData(),
        displayValue,
        unit,
    }, {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        circleVariant: "gauge",
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

function buildProgressBarChannel(label: string, displayValue: string): NonNullable<WidgetData["barChannels"]>[number] {
    return {
        label,
        displayValue,
        unit: "MB/s",
        progress: 0.5,
        color: "#123456",
        iconFragment: "<path d=\"M0 0\" />",
    };
}

interface CircleElement {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly fill: string;
}

interface StrokeCircleElement {
    readonly dashArray: string;
    readonly lineCap: string;
    readonly rotationDegrees: number;
}

function readStrokeCircleElement(svgFragment: string, strokeColor: string): StrokeCircleElement {
    const [element] = readStrokeCircleElements(svgFragment, strokeColor);

    if (element === undefined) {
        assert.fail(`Expected circle stroke ${strokeColor}.`);
    }

    return element;
}

function readStrokeCircleElements(svgFragment: string, strokeColor: string): readonly StrokeCircleElement[] {
    const match = new RegExp(
        `<circle\\b[^>]*?stroke="${escapeRegexLiteral(strokeColor)}"[^>]*?stroke-dasharray="([^"]+)"[^>]*?stroke-linecap="([^"]+)"[^>]*?transform="rotate\\((-?[0-9.]+)`,
        "gu",
    );

    return [...svgFragment.matchAll(match)].map(result => ({
        dashArray: result[1] ?? "",
        lineCap: result[2] ?? "",
        rotationDegrees: Number(result[3]),
    }));
}

function readDashArrayFirstLength(dashArray: string): number {
    return Number(dashArray.split(" ")[0]);
}

function escapeRegexLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readCircleElements(svgFragment: string, className: string): readonly CircleElement[] {
    const pattern = new RegExp(
        `<circle class="${className}"\\s+cx="([^"]+)"\\s+cy="([^"]+)"\\s+r="[^"]+"\\s+fill="([^"]+)"`,
        "gu",
    );
    const elements = [...svgFragment.matchAll(pattern)].map(match => ({
        xCoordinate: Number(match[1]),
        yCoordinate: Number(match[2]),
        fill: match[3] ?? "",
    }));

    if (elements.length === 0) {
        assert.fail(`Expected circle elements for ${className}.`);
    }

    return elements;
}

function readCircleCoordinate(svgFragment: string, className: string, coordinateName: "cx" | "cy"): number {
    const match = new RegExp(`class="${className}"[^>]+${coordinateName}="([^"]+)"`, "u").exec(svgFragment);
    const coordinateText = match?.[1];

    if (coordinateText === undefined) {
        assert.fail(`Expected ${coordinateName} on ${className}.`);
    }

    return Number(coordinateText);
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

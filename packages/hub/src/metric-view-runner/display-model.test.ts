import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import { defaultAppearanceSettings } from "../settings/widget-settings";
import {
    KEYPAD_PNG_SIZE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE,
    WIDGET_LOGICAL_SIZE,
    type DualChannelWidgetData,
    type WidgetData,
} from "../rendering/widget-data";
import type { ArcGaugeStatusIcon } from "../widgets/primitives/arc-gauge";
import {
    buildMetricDisplayRenderPlan,
    buildRenderDualChannelWidgetData,
    buildRenderWidgetData,
    hasMetricDisplayData,
    resolveCircleStyle,
    resolveDisplayLogValue,
    resolveDisplaySampleTimestampMilliseconds,
    resolveTouchStripMetricLayout,
    type SingleMetricDisplayOptions,
} from "./display-model";

test("single value-capable widget without data renders an N/A placeholder copy", () => {
    const widgetData = buildWidgetData({
        current: 73,
        progress: 0.73,
        history: [70, 73],
        unit: "%",
    });

    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: false,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.notEqual(renderWidgetData, widgetData);
    assert.deepEqual(renderWidgetData, {
        ...widgetData,
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        displayValue: "N/A",
    });
});

test("single circular icon placeholder keeps source data and marks the render plan as muted", () => {
    const displayOptions = buildSingleMetricDisplayOptions({
        widgetData: buildWidgetData(),
        resolvedSettings: {
            graphicType: "circular",
            circleStyle: "compact",
        },
    });

    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions,
        isDial: false,
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData: displayOptions.widgetData,
        hasData: renderPlan.displayHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    assert.equal(renderPlan.displayHasData, false);
    assert.equal(renderPlan.shouldRenderMutedIconPlaceholder, true);
    assert.equal(renderWidgetData, displayOptions.widgetData);
});

test("single widget with data keeps the original render data", () => {
    const widgetData = buildWidgetData({
        displayValue: "7",
        sampleTimestampMilliseconds: 1000,
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: true,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.equal(renderWidgetData, widgetData);
});

test("placeholder rendering does not overwrite metric display values when data is present", () => {
    const widgetData = buildWidgetData({
        current: 1,
        displayValue: "1",
        sampleTimestampMilliseconds: 1000,
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: true,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.equal(renderWidgetData.displayValue, "1");
    assert.equal(renderWidgetData.unit, "%");
});

test("dual-channel widget without any data renders both channels as N/A", () => {
    const dualWidgetData = buildDualChannelWidgetData();

    const renderWidgetData = buildRenderDualChannelWidgetData({
        widgetData: dualWidgetData,
        hasData: false,
    });

    assert.equal(renderWidgetData.positive.displayValue, "N/A");
    assert.equal(renderWidgetData.positive.unit, "");
    assert.deepEqual(renderWidgetData.positive.history, []);
    assert.equal(renderWidgetData.negative.displayValue, "N/A");
    assert.equal(renderWidgetData.negative.unit, "");
    assert.deepEqual(renderWidgetData.negative.history, []);
});

test("dual-channel widget fills a missing side with zero history when the other side has data", () => {
    const dualWidgetData = buildDualChannelWidgetData({
        positive: buildWidgetData({
            current: 10,
            history: [4, 6, 10],
            sampleTimestampMilliseconds: 1000,
        }),
        negative: buildWidgetData({
            current: 99,
            history: [],
        }),
    });

    const renderWidgetData = buildRenderDualChannelWidgetData({
        widgetData: dualWidgetData,
        hasData: true,
    });

    assert.equal(renderWidgetData.positive, dualWidgetData.positive);
    assert.deepEqual(renderWidgetData.negative.history, [0, 0, 0]);
    assert.equal(renderWidgetData.negative.current, 0);
    assert.equal(renderWidgetData.negative.displayValue, "0");
});

test("display data helpers treat either dual-channel timestamp as available data", () => {
    const dualWidgetData = buildDualChannelWidgetData({
        positive: buildWidgetData({ current: 3 }),
        negative: buildWidgetData({ current: 7, sampleTimestampMilliseconds: 2000 }),
    });
    const hasDisplayData = hasMetricDisplayData({
        ...buildSingleMetricDisplayOptions({ widgetData: buildWidgetData() }),
        widgetData: dualWidgetData,
        titleText: "Traffic",
        positiveColor: "#00ff00",
        negativeColor: "#ff0000",
    });
    const displayLogValue = resolveDisplayLogValue(dualWidgetData);
    const sampleTimestampMilliseconds = resolveDisplaySampleTimestampMilliseconds(dualWidgetData);

    assert.equal(hasDisplayData, true);
    assert.equal(displayLogValue, 10);
    assert.equal(sampleTimestampMilliseconds, 2000);
});

test("center content falls back to value outside circular graphics", () => {
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: buildSingleMetricDisplayOptions({
            widgetData: buildWidgetData(),
            resolvedSettings: {
                graphicType: "linear",
                circleStyle: "compact",
            },
        }),
        isDial: false,
    });

    assert.equal(renderPlan.centerContent, "value");
});

test("circle style override wins for circular graphics", () => {
    const circleStyle = resolveCircleStyle({
        graphicType: "circular",
        circleStyle: "value",
        circleStyleOverride: "gauge",
    });

    assert.equal(circleStyle, "gauge");
});

test("compact circle style uses icon center content", () => {
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: buildSingleMetricDisplayOptions({
            widgetData: buildWidgetData(),
            resolvedSettings: {
                graphicType: "circular",
                circleStyle: "compact",
            },
        }),
        isDial: false,
    });

    assert.equal(renderPlan.centerContent, "icon");
});

test("key render plan uses keypad PNG dimensions and no touch strip layout", () => {
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: buildSingleMetricDisplayOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                graphicType: "linear",
            },
        }),
        isDial: false,
    });

    assert.equal(renderPlan.touchStripMetricLayout, null);
    assert.deepEqual(renderPlan.renderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.pngSize, KEYPAD_PNG_SIZE);
});

test("touch strip layout uses square rendering for circular graphics", () => {
    const renderPlan = buildMetricDisplayRenderPlan({
        displayOptions: buildSingleMetricDisplayOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                graphicType: "circular",
            },
        }),
        isDial: true,
    });

    assert.equal(renderPlan.touchStripMetricLayout?.kind, "square");
    assert.deepEqual(renderPlan.renderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.pngSize, TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE);
});

test("touch strip layout uses wide rendering for non-circular graphics", () => {
    const touchStripMetricLayout = resolveTouchStripMetricLayout({
        graphicType: "dashed-line",
        circleStyle: "value",
        graphicStyle: "flat",
        colorConfig: {
            mode: "solid",
            solidColor: "#ffffff",
            thresholds: [],
        },
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    });

    assert.equal(touchStripMetricLayout.kind, "wide");
    assert.deepEqual(touchStripMetricLayout.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(touchStripMetricLayout.pngSize, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE);
});

function buildSingleMetricDisplayOptions(options: {
    widgetData: WidgetData;
    resolvedSettings?: Partial<SingleMetricDisplayOptions["resolvedSettings"]>;
}): SingleMetricDisplayOptions {
    return {
        event: {
            action: {
                id: "action-id",
            },
            payload: {
                settings: {},
            },
        } as WillAppearEvent,
        metricKey: "cpu.usage_percent",
        centerIconFragment: "<path />",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        resolvedSettings: {
            ...defaultAppearanceSettings,
            ...options.resolvedSettings,
        },
    };
}

function buildDualChannelWidgetData(options: Partial<DualChannelWidgetData> = {}): DualChannelWidgetData {
    return {
        positive: options.positive ?? buildWidgetData({ label: "UP" }),
        negative: options.negative ?? buildWidgetData({ label: "DOWN" }),
    };
}

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "CPU",
        displayValue: options.displayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

function buildStatusIcon(): ArcGaugeStatusIcon {
    return {
        fragment: "<path />",
        viewBox: {
            x: 0,
            y: 0,
            width: 24,
            height: 24,
        },
    };
}

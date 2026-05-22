import assert from "node:assert/strict";
import test from "node:test";
import {
    buildDefaultAppearanceSettings,
} from "../settings/default-appearance-settings";
import type { ResolvedAppearanceSettingsOverride } from "../settings/appearance-overrides";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";
import {
    KEYPAD_PNG_SIZE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE,
    WIDGET_LOGICAL_SIZE,
    type DualChannelWidgetData,
    type WidgetData,
} from "../view-rendering/widget-data";
import type { ProgressCircleStatusIcon } from "../widgets/primitives/progress-circle";
import {
    buildMetricViewRenderPlan,
    buildRenderDualChannelWidgetData,
    buildRenderWidgetData,
    composeMetricViewFrame,
    hasMetricViewData,
    resolveEffectiveCircleVariant,
    resolveMetricViewLogValue,
    resolveMetricViewSampleTimestampMilliseconds,
    resolveTouchStripMetricLayout,
    type DualMetricRenderOptions,
    type SingleMetricRenderOptions,
} from "./metric-view-frame";

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

test("single circle icon placeholder keeps source data and marks the render plan as muted", () => {
    const viewOptions = buildSingleMetricRenderOptions({
        widgetData: buildWidgetData(),
        resolvedSettings: {
            view: {
                selectedView: "circle",
                circleVariant: "minimal",
            },
        },
    });

    const renderPlan = buildMetricViewRenderPlan({
        viewOptions,
        renderTarget: "key",
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData: viewOptions.widgetData,
        hasData: renderPlan.viewHasData,
        shouldRenderMutedIconPlaceholder: renderPlan.shouldRenderMutedIconPlaceholder,
    });

    assert.equal(renderPlan.viewHasData, false);
    assert.equal(renderPlan.shouldRenderMutedIconPlaceholder, true);
    assert.equal(renderWidgetData, viewOptions.widgetData);
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

test("dual text view does not render caller unit text for unavailable channels", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDualMetricRenderOptions({
            widgetData: buildDualChannelWidgetData({
                positive: buildWidgetData({ label: "UP", unit: "MB/s" }),
                negative: buildWidgetData({ label: "DOWN", unit: "MB/s" }),
            }),
            positiveUnitText: "M",
            negativeUnitText: "M",
        }),
        renderTarget: "key",
    });

    assert.match(frame.svg, />N\/A<\/text>/);
    assert.doesNotMatch(frame.svg, />M<\/text>/);
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

test("metric data helpers treat either dual-channel timestamp as available data", () => {
    const dualWidgetData = buildDualChannelWidgetData({
        positive: buildWidgetData({ current: 3 }),
        negative: buildWidgetData({ current: 7, sampleTimestampMilliseconds: 2000 }),
    });
    const hasViewData = hasMetricViewData({
        ...buildSingleMetricRenderOptions({ widgetData: buildWidgetData() }),
        widgetData: dualWidgetData,
        titleText: "Traffic",
        positiveColor: "#00ff00",
        negativeColor: "#ff0000",
    });
    const displayLogValue = resolveMetricViewLogValue(dualWidgetData);
    const sampleTimestampMilliseconds = resolveMetricViewSampleTimestampMilliseconds(dualWidgetData);

    assert.equal(hasViewData, true);
    assert.equal(displayLogValue, 10);
    assert.equal(sampleTimestampMilliseconds, 2000);
});

test("center content falls back to value outside circle renderer branches", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData(),
            resolvedSettings: {
                view: {
                    selectedView: "bar",
                    circleVariant: "minimal",
                },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(renderPlan.centerContent, "value");
});

test("circle variant override wins for circle renderer branches", () => {
    const circleVariant = resolveEffectiveCircleVariant({
        renderPrimitive: "circle",
        circleVariant: "full-ring",
        circleVariantOverride: "gauge",
    });

    assert.equal(circleVariant, "gauge");
});

test("minimal circle variant uses icon center content", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData(),
            resolvedSettings: {
                view: {
                    selectedView: "circle",
                    circleVariant: "minimal",
                },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(renderPlan.centerContent, "icon");
});

test("key render plan uses keypad PNG dimensions and no touch strip layout", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                view: { selectedView: "bar" },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(renderPlan.touchStripMetricLayout, null);
    assert.deepEqual(renderPlan.renderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.pngSize, KEYPAD_PNG_SIZE);
});

test("touch strip layout uses square rendering for circle branches", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                view: { selectedView: "circle" },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(renderPlan.touchStripMetricLayout?.kind, "square");
    assert.deepEqual(renderPlan.renderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.pngSize, TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE);
});

test("touch strip layout uses wide rendering for non-circle branches", () => {
    const renderAppearance = buildMetricRenderAppearance(
        buildDefaultAppearanceSettings({ view: { selectedView: "line" } }),
    );
    const touchStripMetricLayout = resolveTouchStripMetricLayout(renderAppearance);

    assert.equal(touchStripMetricLayout.kind, "wide");
    assert.deepEqual(touchStripMetricLayout.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(touchStripMetricLayout.pngSize, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE);
});

function buildSingleMetricRenderOptions(options: {
    widgetData: WidgetData;
    resolvedSettings?: ResolvedAppearanceSettingsOverride;
}): SingleMetricRenderOptions {
    return {
        centerIconFragment: "<path />",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        resolvedSettings: buildDefaultAppearanceSettings(options.resolvedSettings),
    };
}

function buildDualMetricRenderOptions(options: {
    widgetData: DualChannelWidgetData;
    positiveUnitText?: string;
    negativeUnitText?: string;
}): DualMetricRenderOptions {
    return {
        centerIconFragment: "",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        titleText: "NET",
        dualRenderPrimitive: "text",
        positiveColor: "#ffffff",
        negativeColor: "#ffffff",
        positiveLabelText: "UP",
        negativeLabelText: "DN",
        positiveUnitText: options.positiveUnitText,
        negativeUnitText: options.negativeUnitText,
        resolvedSettings: buildDefaultAppearanceSettings({
            view: { selectedView: "text" },
        }),
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

function buildStatusIcon(): ProgressCircleStatusIcon {
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

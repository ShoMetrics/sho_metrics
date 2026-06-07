import assert from "node:assert/strict";
import test from "node:test";
import {
    buildDefaultAppearanceSettings,
} from "../settings/default-appearance-settings";
import type { ResolvedAppearanceSettingsOverride } from "../settings/appearance-overrides";
import { buildMetricRenderAppearance } from "../settings/render-appearance-builder";
import type { DenseMetricWidgetData } from "../actions/dense-multi-metric/row-data";
import {
    KEYPAD_PNG_SIZE,
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    TOUCH_STRIP_LOGICAL_SIZE,
    TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE,
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
    type MetricRenderedData,
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

test("single value-capable widget without data falls back to N/A for ordinary unavailable copy", () => {
    const widgetData = buildWidgetData({
        unavailableDisplayValue: "No sensor data",
    });

    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: false,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.equal(renderWidgetData.displayValue, "N/A");
});

test("single value-capable widget without data can render pending refresh copy", () => {
    const widgetData = buildWidgetData({
        unavailableDisplayValue: PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    });

    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: false,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.equal(renderWidgetData.displayValue, PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE);
});

test("single metric notice renders a dedicated notice body", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData(),
            noticeText: "Install helper",
            resolvedSettings: {
                view: { selectedView: "text" },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(readSingleRenderedMetricData(frame.renderedMetricData).displayValue, "N/A");
    assert.match(frame.svg, /metric-notice-line-0/);
    assert.match(frame.svg, />Install<\/text>/);
    assert.match(frame.svg, />helper<\/text>/);
    assert.doesNotMatch(frame.svg, /text-metric-value/);
});

test("ordinary unavailable copy keeps the selected primitive and generic N/A display", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({
                unavailableDisplayValue: "No sensor data",
            }),
            resolvedSettings: {
                view: { selectedView: "text" },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(readSingleRenderedMetricData(frame.renderedMetricData).displayValue, "N/A");
    assert.doesNotMatch(frame.svg, /data-metric-unavailable-body=/);
    assert.match(frame.svg, />N\/A<\/text>/);
});

test("pending refresh copy keeps the selected primitive and loading display", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({
                unavailableDisplayValue: PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
            }),
            resolvedSettings: {
                view: { selectedView: "text" },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(readSingleRenderedMetricData(frame.renderedMetricData).displayValue, PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE);
    assert.doesNotMatch(frame.svg, /data-metric-unavailable-body=/);
    assert.match(frame.svg, />\.\.\.<\/text>/);
});

test("minimal circle uses notice body when notice text is present", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData(),
            noticeText: "Install helper",
            resolvedSettings: {
                view: {
                    selectedView: "circle",
                    circleVariant: "minimal",
                },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(frame.renderPlan.shouldRenderMutedIconPlaceholder, false);
    assert.match(frame.svg, />Install<\/text>/);
    assert.doesNotMatch(frame.svg, /muted-widget/);
});

test("minimal circle keeps the muted icon placeholder during pending refresh", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({
                unavailableDisplayValue: PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
            }),
            resolvedSettings: {
                view: {
                    selectedView: "circle",
                    circleVariant: "minimal",
                },
            },
        }),
        renderTarget: "key",
    });

    assert.equal(frame.renderPlan.shouldRenderMutedIconPlaceholder, true);
    assert.doesNotMatch(frame.svg, />\.\.\.<\/text>/);
    assert.match(frame.svg, /muted-widget/);
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

test("single widget render data formats temperature units for renderers", () => {
    const widgetData = buildWidgetData({
        unit: "C",
        barUnit: "F",
        sampleTimestampMilliseconds: 1000,
    });
    const renderWidgetData = buildRenderWidgetData({
        widgetData,
        hasData: true,
        shouldRenderMutedIconPlaceholder: false,
    });

    assert.notEqual(renderWidgetData, widgetData);
    assert.equal(widgetData.unit, "C");
    assert.equal(widgetData.barUnit, "F");
    assert.equal(renderWidgetData.unit, "°C");
    assert.equal(renderWidgetData.barUnit, "°F");
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

test("dual-channel render data formats temperature units for renderers", () => {
    const dualWidgetData = buildDualChannelWidgetData({
        positive: buildWidgetData({ unit: "C", sampleTimestampMilliseconds: 1000 }),
        negative: buildWidgetData({ unit: "F", sampleTimestampMilliseconds: 1000 }),
    });
    const renderWidgetData = buildRenderDualChannelWidgetData({
        widgetData: dualWidgetData,
        hasData: true,
    });

    assert.equal(renderWidgetData.positive.unit, "°C");
    assert.equal(renderWidgetData.negative.unit, "°F");
});

test("dual text view does not render unit text for unavailable channels", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDualMetricRenderOptions({
            widgetData: buildDualChannelWidgetData({
                positive: buildWidgetData({ label: "UP", unit: "MB/s" }),
                negative: buildWidgetData({ label: "DOWN", unit: "MB/s" }),
            }),
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
    const hasViewData = hasMetricViewData(buildDualMetricRenderOptions({
        widgetData: dualWidgetData,
    }));
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
    assert.deepEqual(renderPlan.bodyRenderSize, WIDGET_LOGICAL_SIZE);
    assert.equal(renderPlan.bodyViewport, undefined);
    assert.deepEqual(renderPlan.pngSize, KEYPAD_PNG_SIZE);
});

test("pixel window keeps square text body inside the client viewport", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({
                displayValue: "42",
                sampleTimestampMilliseconds: 1000,
            }),
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
                view: { selectedView: "text" },
            },
        }),
        renderTarget: "key",
    });

    assert.deepEqual(frame.renderPlan.renderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(frame.renderPlan.bodyRenderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(frame.renderPlan.bodyViewport, {
        xCoordinate: 5,
        yCoordinate: 19,
        width: 134,
        height: 120,
        body: {
            xOffset: 7,
            yOffset: 0,
            renderSize: WIDGET_LOGICAL_SIZE,
        },
        clipRadius: 0,
    });
    assert.match(frame.svg, /width="144" height="144"/);
    assert.match(frame.svg, /viewBox="0 0 144 144"/);
    assert.match(frame.svg, /<g transform="translate\(12 19\) scale\(0\.8333\)">/);
});

test("pixel window wide touch strip renders non-circle body across the full client viewport", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
                view: { selectedView: "line" },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(renderPlan.touchStripMetricLayout?.kind, "wide");
    assert.deepEqual(renderPlan.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.bodyRenderSize, { width: 190, height: 78 });
    assert.ok(renderPlan.bodyViewport);
    assert.deepEqual(renderPlan.bodyViewport, {
        xCoordinate: 5,
        yCoordinate: 17,
        width: 190,
        height: 78,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: { width: 190, height: 78 },
        },
        clipRadius: 0,
    });
    assert.ok(renderPlan.bodyViewport.height >= 60);
});

test("touch strip layout uses a wide frame with square body for circle branches", () => {
    const renderPlan = buildMetricViewRenderPlan({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                view: { selectedView: "circle" },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(renderPlan.touchStripMetricLayout?.kind, "wide-frame-square-body");
    assert.deepEqual(renderPlan.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(renderPlan.bodyRenderSize, WIDGET_LOGICAL_SIZE);
    assert.equal(renderPlan.bodyViewports.length, 1);
    assert.deepEqual(renderPlan.bodyViewport, {
        xCoordinate: 50,
        yCoordinate: 0,
        width: 100,
        height: 100,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: WIDGET_LOGICAL_SIZE,
        },
        clipRadius: undefined,
    });
    assert.deepEqual(renderPlan.pngSize, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE);
});

test("pixel window circle touch strip places a square body inside the client viewport", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildSingleMetricRenderOptions({
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: 1000 }),
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
                view: { selectedView: "circle" },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide-frame-square-body");
    assert.deepEqual(frame.renderPlan.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(frame.renderPlan.bodyRenderSize, WIDGET_LOGICAL_SIZE);
    assert.equal(frame.renderPlan.bodyViewports.length, 1);
    assert.deepEqual(frame.renderPlan.bodyViewport, {
        xCoordinate: 61,
        yCoordinate: 17,
        width: 78,
        height: 78,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: WIDGET_LOGICAL_SIZE,
        },
        clipRadius: 0,
    });
    assert.deepEqual(frame.renderPlan.pngSize, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE);
    assert.match(frame.svg, /width="200" height="100"/);
    assert.match(frame.svg, /viewBox="0 0 200 100"/);
    assert.match(frame.svg, /<g transform="translate\(61 17\) scale\(0\.5417\)">/);
});

test("dual circle touch strip renders two square body slots", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDualMetricRenderOptions({
            widgetData: buildDualChannelWidgetData({
                positive: buildWidgetData({
                    current: 42,
                    progress: 0.42,
                    label: "UP",
                    sampleTimestampMilliseconds: 1000,
                }),
                negative: buildWidgetData({
                    current: 17,
                    progress: 0.17,
                    label: "DN",
                    sampleTimestampMilliseconds: 1000,
                }),
            }),
            selectedView: "circle",
            dualRenderPrimitive: "circle",
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide-frame-two-square-bodies");
    assert.deepEqual(frame.renderPlan.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(frame.renderPlan.bodyRenderSize, WIDGET_LOGICAL_SIZE);
    assert.deepEqual(frame.renderPlan.bodyViewports, [
        {
            xCoordinate: 0,
            yCoordinate: 0,
            width: 100,
            height: 100,
            body: {
                xOffset: 0,
                yOffset: 0,
                renderSize: WIDGET_LOGICAL_SIZE,
            },
            clipRadius: undefined,
        },
        {
            xCoordinate: 100,
            yCoordinate: 0,
            width: 100,
            height: 100,
            body: {
                xOffset: 0,
                yOffset: 0,
                renderSize: WIDGET_LOGICAL_SIZE,
            },
            clipRadius: undefined,
        },
    ]);
    assert.match(frame.svg, /flat-body-viewport-0-0-0-100-100/);
    assert.match(frame.svg, /flat-body-viewport-1-100-0-100-100/);
    assert.match(frame.svg, /translate\(0 0\) scale\(0\.6944\)/);
    assert.match(frame.svg, /translate\(100 0\) scale\(0\.6944\)/);
});

test("pixel window dual circle touch strip places two square body slots inside the client viewport", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDualMetricRenderOptions({
            widgetData: buildDualChannelWidgetData({
                positive: buildWidgetData({ label: "UP", sampleTimestampMilliseconds: 1000 }),
                negative: buildWidgetData({ label: "DN", sampleTimestampMilliseconds: 1000 }),
            }),
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
                view: { selectedView: "circle" },
            },
            dualRenderPrimitive: "circle",
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide-frame-two-square-bodies");
    assert.deepEqual(frame.renderPlan.bodyViewports, [
        {
            xCoordinate: 13,
            yCoordinate: 17,
            width: 78,
            height: 78,
            body: {
                xOffset: 0,
                yOffset: 0,
                renderSize: WIDGET_LOGICAL_SIZE,
            },
            clipRadius: 0,
        },
        {
            xCoordinate: 108,
            yCoordinate: 17,
            width: 78,
            height: 78,
            body: {
                xOffset: 0,
                yOffset: 0,
                renderSize: WIDGET_LOGICAL_SIZE,
            },
            clipRadius: 0,
        },
    ]);
    assert.match(frame.svg, /pixel-window-body-viewport-0-13-17-78-78/);
    assert.match(frame.svg, /pixel-window-body-viewport-1-108-17-78-78/);
    assert.match(frame.svg, /translate\(13 17\) scale\(0\.5417\)/);
    assert.match(frame.svg, /translate\(108 17\) scale\(0\.5417\)/);
});

test("touch strip layout uses wide rendering for non-circle branches", () => {
    const renderAppearance = buildMetricRenderAppearance(
        buildDefaultAppearanceSettings({ view: { selectedView: "line" } }),
    );
    const touchStripMetricLayout = resolveTouchStripMetricLayout({
        renderPrimitive: renderAppearance.renderPrimitive,
    });

    assert.equal(touchStripMetricLayout.kind, "wide");
    assert.deepEqual(touchStripMetricLayout.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.deepEqual(touchStripMetricLayout.pngSize, TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE);
});

test("dual circle gauge touch strip renders two complete gauge bodies", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDualMetricRenderOptions({
            widgetData: buildDualChannelWidgetData({
                positive: buildWidgetData({ label: "UP", sampleTimestampMilliseconds: 1000 }),
                negative: buildWidgetData({ label: "DN", sampleTimestampMilliseconds: 1000 }),
            }),
            selectedView: "circle",
            dualRenderPrimitive: "circle",
            resolvedSettings: {
                view: {
                    selectedView: "circle",
                    circleVariant: "gauge",
                },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide-frame-two-square-bodies");
    assert.equal(frame.renderPlan.bodyViewports.length, 2);
    assert.match(frame.svg, /flat-body-viewport-0-0-0-100-100/);
    assert.match(frame.svg, /flat-body-viewport-1-100-0-100-100/);
    assert.match(frame.svg, /progress-circle-range-segment/);
    assert.doesNotMatch(frame.svg, /dual-arc-positive-range-/);
    assert.doesNotMatch(frame.svg, /dual-arc-negative-range-/);
});

test("dense metric frame renders a progress list body", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDenseMetricRenderOptions({
            widgetData: buildDenseMetricWidgetData(3),
        }),
        renderTarget: "key",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout, null);
    assert.match(frame.svg, /dense-progress-list-row/);
    assert.equal(countMatches(frame.svg, /class="dense-progress-list-row"/gu), 3);
});

test("dense pixel window frame uses the full client viewport", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDenseMetricRenderOptions({
            widgetData: {
                rows: ["CPU", "GPU", "RAM", "RAM", "RAM", "RAM"].map((label, index) => buildDenseMetricRow({
                    slotId: `dense-slot-${index}`,
                    label,
                })),
            },
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
            },
        }),
        renderTarget: "key",
    });

    assert.deepEqual(frame.renderPlan.bodyRenderSize, { width: 134, height: 120 });
    assert.deepEqual(frame.renderPlan.bodyViewport, {
        xCoordinate: 5,
        yCoordinate: 19,
        width: 134,
        height: 120,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: { width: 134, height: 120 },
        },
        clipRadius: 0,
    });
    assert.match(frame.svg, /<g transform="translate\(5 19\)">/);
    assert.doesNotMatch(frame.svg, /scale\(0\.8333\)/);
    assert.ok(readDenseLabelTextElements(frame.svg).every(element => !/letter-spacing=/u.test(element)));
    assert.ok(readDenseLabelTextElements(frame.svg).every(element => !/textLength=/u.test(element)));
});

test("dense metric frame uses the wide touch strip layout", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDenseMetricRenderOptions({
            widgetData: buildDenseMetricWidgetData(5),
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide");
    assert.deepEqual(frame.renderPlan.renderSize, TOUCH_STRIP_LOGICAL_SIZE);
    assert.equal(countMatches(frame.svg, /class="dense-progress-list-row"/gu), 5);
});

test("dense pixel window touch strip frame uses the full client viewport", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDenseMetricRenderOptions({
            widgetData: buildDenseMetricWidgetData(6),
            resolvedSettings: {
                theme: { selectedTheme: "pixel-window" },
            },
        }),
        renderTarget: "touch-strip",
    });

    assert.equal(frame.renderPlan.touchStripMetricLayout?.kind, "wide");
    assert.deepEqual(frame.renderPlan.bodyRenderSize, { width: 190, height: 78 });
    assert.deepEqual(frame.renderPlan.bodyViewport, {
        xCoordinate: 5,
        yCoordinate: 17,
        width: 190,
        height: 78,
        body: {
            xOffset: 0,
            yOffset: 0,
            renderSize: { width: 190, height: 78 },
        },
        clipRadius: 0,
    });
    assert.match(frame.svg, /<g transform="translate\(5 17\)">/);
    assert.doesNotMatch(frame.svg, /scale\(0\.78\)/);
});

test("dense metric frame keeps missing samples isolated to their rows", () => {
    const frame = composeMetricViewFrame({
        viewOptions: buildDenseMetricRenderOptions({
            widgetData: {
                rows: [
                    buildDenseMetricRow({
                        slotId: "fresh",
                        label: "CPU",
                        current: 26,
                        progress: 0.26,
                        sampleTimestampMilliseconds: 1000,
                    }),
                    buildDenseMetricRow({
                        slotId: "missing",
                        label: "GPU",
                        sampleTimestampMilliseconds: undefined,
                    }),
                ],
            },
        }),
        renderTarget: "key",
    });

    const renderedMetricData = readDenseRenderedMetricData(frame.renderedMetricData);

    assert.equal(renderedMetricData.rows[0]?.widgetData.displayValue, "26");
    assert.equal(renderedMetricData.rows[1]?.widgetData.displayValue, "N/A");
});

function buildSingleMetricRenderOptions(options: {
    widgetData: WidgetData;
    noticeText?: string;
    resolvedSettings?: ResolvedAppearanceSettingsOverride;
}): SingleMetricRenderOptions {
    return {
        metricRenderKind: "singleMetric",
        centerIconFragment: "<path />",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        ...(options.noticeText === undefined ? {} : { noticeText: options.noticeText }),
        resolvedSettings: buildDefaultAppearanceSettings(options.resolvedSettings),
    };
}

function buildDualMetricRenderOptions(options: {
    widgetData: DualChannelWidgetData;
    resolvedSettings?: ResolvedAppearanceSettingsOverride;
    selectedView?: "circle" | "text" | "line";
    dualRenderPrimitive?: "circle" | "text" | "sparkline";
}): DualMetricRenderOptions {
    return {
        metricRenderKind: "dualMetric",
        centerIconFragment: "",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        titleText: "NET",
        dualRenderPrimitive: options.dualRenderPrimitive ?? "text",
        positiveColor: "#ffffff",
        negativeColor: "#ffffff",
        positiveLabelText: "UP",
        negativeLabelText: "DN",
        resolvedSettings: buildDefaultAppearanceSettings({
            view: { selectedView: options.selectedView ?? "text" },
            ...options.resolvedSettings,
        }),
    };
}

function buildDenseMetricRenderOptions(options: {
    widgetData: DenseMetricWidgetData;
    resolvedSettings?: ResolvedAppearanceSettingsOverride;
}) {
    return {
        metricRenderKind: "denseMetric" as const,
        centerIconFragment: "",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData,
        resolvedSettings: buildDefaultAppearanceSettings(options.resolvedSettings),
    };
}

function readSingleRenderedMetricData(metricData: MetricRenderedData): WidgetData {
    if ("rows" in metricData || "positive" in metricData) {
        throw new Error("Expected single metric render data.");
    }

    return metricData;
}

function readDenseRenderedMetricData(metricData: MetricRenderedData): DenseMetricWidgetData {
    if (!("rows" in metricData)) {
        throw new Error("Expected dense metric render data.");
    }

    return metricData;
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
        barUnit: options.barUnit,
        label: options.label ?? "CPU",
        displayValue: options.displayValue,
        unavailableDisplayValue: options.unavailableDisplayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

function buildDenseMetricWidgetData(rowCount: number): DenseMetricWidgetData {
    return {
        rows: Array.from({ length: rowCount }, (_, index) => buildDenseMetricRow({
            slotId: `dense-slot-${index}`,
            label: `R${index}`,
            current: index + 1,
            progress: (index + 1) / rowCount,
        })),
    };
}

function buildDenseMetricRow(options: {
    readonly slotId: string;
    readonly label: string;
    readonly current?: number;
    readonly progress?: number;
    readonly sampleTimestampMilliseconds?: number | undefined;
}) {
    const widgetData = buildWidgetData({
        label: options.label,
        current: options.current,
        progress: options.progress,
        displayValue: options.current?.toFixed(0),
    });

    return {
        rowKind: "configured" as const,
        slotId: options.slotId,
        metricKey: `metric.${options.slotId}`,
        widgetData: "sampleTimestampMilliseconds" in options
            ? { ...widgetData, sampleTimestampMilliseconds: options.sampleTimestampMilliseconds }
            : widgetData,
    };
}

function countMatches(text: string, pattern: RegExp): number {
    return [...text.matchAll(pattern)].length;
}

function readDenseLabelTextElements(svg: string): readonly string[] {
    return [...svg.matchAll(/<clipPath id="dense-progress-list-label-\d+">[\s\S]*?<\/clipPath>\s*<\/defs>\s*<g clip-path="url\(#dense-progress-list-label-\d+\)">\s*(<text[\s\S]*?<\/text>)/gu)]
        .map(match => match[1] ?? "");
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

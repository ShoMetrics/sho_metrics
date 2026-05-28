import assert from "node:assert/strict";
import test from "node:test";

import { buildNetworkPingWidgetData } from "./network-ping-widget-data";

test("network ping widget data rounds display value and exposes milliseconds", () => {
    const widgetData = buildNetworkPingWidgetData({
        latencyMilliseconds: 23.6,
        historyLatencyMilliseconds: [10, 20],
        sampleTimestampMilliseconds: 1000,
    });

    assert.equal(widgetData.current, 23.6);
    assert.equal(widgetData.displayValue, "24");
    assert.equal(widgetData.unit, "ms");
    assert.equal(widgetData.label, "PING");
    assert.deepEqual(widgetData.history, [10, 20]);
    assert.deepEqual(widgetData.sparklineScale, { mode: "adaptive", minimumValue: 0 });
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
});

test("network ping widget data clamps progress to 200 milliseconds", () => {
    assert.equal(buildNetworkPingWidgetData({
        latencyMilliseconds: 50,
        historyLatencyMilliseconds: [],
    }).progress, 0.25);
    assert.equal(buildNetworkPingWidgetData({
        latencyMilliseconds: 250,
        historyLatencyMilliseconds: [],
    }).progress, 1);
});

test("network ping widget data treats invalid display input as zero", () => {
    for (const latencyMilliseconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const widgetData = buildNetworkPingWidgetData({
            latencyMilliseconds,
            historyLatencyMilliseconds: [latencyMilliseconds],
        });

        assert.equal(widgetData.current, 0);
        assert.equal(widgetData.progress, 0);
        assert.equal(widgetData.displayValue, "0");
        assert.deepEqual(widgetData.history, [latencyMilliseconds]);
    }
});

test("network ping widget data leaves sample timestamp unset for no-sample rendering", () => {
    const widgetData = buildNetworkPingWidgetData({
        latencyMilliseconds: 0,
        historyLatencyMilliseconds: [],
    });

    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
});

import assert from "node:assert/strict";
import { test } from "vitest";

import { buildNetworkPingWidgetData } from "./network-ping-widget-data";

const CURRENT_TIMESTAMP_MILLISECONDS = 2000;
const POLLING_FREQUENCY_SECONDS = 1;
const MAXIMUM_LATENCY_MILLISECONDS = 300;

test("network ping widget data rounds display value and exposes milliseconds", () => {
    const widgetData = buildNetworkPingWidgetData({
        latencyMilliseconds: 23.6,
        historyLatencyMilliseconds: [10, 20],
        maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: CURRENT_TIMESTAMP_MILLISECONDS,
        pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
    });

    assert.equal(widgetData.current, 23.6);
    assert.equal(widgetData.displayValue, "24");
    assert.equal(widgetData.unit, "ms");
    assert.equal(widgetData.label, "PING");
    assert.deepEqual(widgetData.history, [10, 20]);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: MAXIMUM_LATENCY_MILLISECONDS,
    });
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
});

test("network ping widget data uses and clamps to the configured maximum latency", () => {
    assert.equal(buildNetworkPingWidgetData({
        latencyMilliseconds: 75,
        historyLatencyMilliseconds: [],
        maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: CURRENT_TIMESTAMP_MILLISECONDS,
        pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
    }).progress, 0.25);
    assert.equal(buildNetworkPingWidgetData({
        latencyMilliseconds: 350,
        historyLatencyMilliseconds: [],
        maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: CURRENT_TIMESTAMP_MILLISECONDS,
        pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
    }).progress, 1);
});

test("network ping widget data treats invalid display input as zero", () => {
    for (const latencyMilliseconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const widgetData = buildNetworkPingWidgetData({
            latencyMilliseconds,
            historyLatencyMilliseconds: [latencyMilliseconds],
            maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
            sampleTimestampMilliseconds: 1000,
            currentTimestampMilliseconds: CURRENT_TIMESTAMP_MILLISECONDS,
            pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
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
        maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
        sampleTimestampMilliseconds: undefined,
        currentTimestampMilliseconds: CURRENT_TIMESTAMP_MILLISECONDS,
        pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
    });

    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
});

test("network ping widget data treats stale samples as no data", () => {
    const widgetData = buildNetworkPingWidgetData({
        latencyMilliseconds: 24,
        historyLatencyMilliseconds: [24],
        maximumLatencyMilliseconds: MAXIMUM_LATENCY_MILLISECONDS,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: 7001,
        pollingFrequencySeconds: POLLING_FREQUENCY_SECONDS,
    });

    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(widgetData.current, 0);
    assert.deepEqual(widgetData.history, []);
});

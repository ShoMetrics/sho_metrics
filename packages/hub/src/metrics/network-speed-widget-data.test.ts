import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildNetworkSpeedWidgetData,
    convertMegabitsPerSecondToBytesPerSecond,
} from "./network-speed-widget-data";

test("network speed widget data clamps the live sample without rewriting history", () => {
    const widgetData = buildNetworkSpeedWidgetData({
        bytesPerSecond: -50,
        historyBytesPerSecond: [-50, 50],
        maximumBytesPerSecond: 0,
        label: "NET",
        unitBase: "byte",
        maximumDisplayDigits: 3,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: 1000,
        pollingFrequencySeconds: 1,
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.progress, 0);
    assert.equal(widgetData.displayValue, "0");
    assert.equal(widgetData.unit, "KB/s");
    assert.deepEqual(widgetData.history, [-50, 50]);
    assert.equal(widgetData.sampleTimestampMilliseconds, 1000);
});

test("network speed widget data uses decimal bit units for traffic displays", () => {
    const widgetData = buildNetworkSpeedWidgetData({
        bytesPerSecond: 12_500,
        historyBytesPerSecond: [0, 12_500],
        maximumBytesPerSecond: 25_000,
        label: "DOWN",
        unitBase: "bit",
        maximumDisplayDigits: 3,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: 1000,
        pollingFrequencySeconds: 1,
    });

    assert.equal(widgetData.current, 12_500);
    assert.equal(widgetData.progress, 0.5);
    assert.equal(widgetData.displayValue, "100");
    assert.equal(widgetData.unit, "Kb/s");
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 25_000,
    });
});

test("network speed widget data treats stale rate samples as no data", () => {
    const widgetData = buildNetworkSpeedWidgetData({
        bytesPerSecond: 12_500,
        historyBytesPerSecond: [0, 12_500],
        maximumBytesPerSecond: 25_000,
        label: "DOWN",
        unitBase: "bit",
        maximumDisplayDigits: 3,
        sampleTimestampMilliseconds: 1000,
        currentTimestampMilliseconds: 7001,
        pollingFrequencySeconds: 1,
    });

    assert.equal(widgetData.current, 0);
    assert.deepEqual(widgetData.history, []);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 25_000,
    });
    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
});

test("network speed maximum converts megabits to bytes and rejects negative input", () => {
    assert.equal(convertMegabitsPerSecondToBytesPerSecond(8), 1_000_000);
    assert.equal(convertMegabitsPerSecondToBytesPerSecond(-8), 0);
});

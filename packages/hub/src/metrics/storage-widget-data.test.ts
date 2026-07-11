import assert from "node:assert/strict";
import { test } from "vitest";
import { buildWidgetDataFixture } from "../../tests/testing/widget-data-fixtures";
import {
    buildDiskThroughputWidgetData,
    buildDiskUsageWidgetData,
    buildMemoryUsageWidgetData,
} from "./storage-widget-data";

test("memory usage widget data exposes percentage while formatting used and total together", () => {
    const widgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({
            current: 512 * 1024 ** 3,
            history: [256 * 1024 ** 3, 512 * 1024 ** 3],
            unit: "B",
        }),
        totalBytes: 1024 ** 4,
        label: "RAM",
    });

    assert.equal(widgetData.current, 50);
    assert.equal(widgetData.progress, 0.5);
    assert.equal(widgetData.displayValue, "50");
    assert.equal(widgetData.secondaryDisplayValue, "0.5 / 1.0 TB");
    assert.deepEqual(widgetData.history, [25, 50]);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});

test("disk usage space mode keeps available space as primary text and percentage as bar text", () => {
    const widgetData = buildDiskUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({
            current: 1.5 * 1024 ** 3,
            history: [1024 ** 3, 1.5 * 1024 ** 3],
            unit: "B",
        }),
        totalBytes: 2 * 1024 ** 3,
        availableBytes: 512 * 1024 ** 2,
        displayMode: "space",
        label: "DISK",
        barLabel: "USED",
    });

    assert.equal(widgetData.current, 75);
    assert.equal(widgetData.displayValue, "512");
    assert.equal(widgetData.unit, "MB");
    assert.equal(widgetData.barLabel, "USED");
    assert.equal(widgetData.barDisplayValue, "75");
    assert.equal(widgetData.barUnit, "%");
});

test("disk throughput widget data clamps the live sample without rewriting history", () => {
    const widgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: buildWidgetDataFixture({
            current: -1,
            history: [-1, 2048],
            unit: "B/s",
            sampleTimestampMilliseconds: 1000,
        }),
        maximumBytesPerSecond: 0,
        label: "DISK",
        currentTimestampMilliseconds: 1000,
        pollingFrequencySeconds: 1,
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.progress, 0);
    assert.equal(widgetData.displayValue, "0");
    assert.equal(widgetData.unit, "KB/s");
    assert.deepEqual(widgetData.history, [-1, 2048]);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 1024 * 1024,
    });
});

test("disk throughput widget data treats stale rate samples as no data", () => {
    const widgetData = buildDiskThroughputWidgetData({
        bytesPerSecondWidgetData: buildWidgetDataFixture({
            current: 2048,
            history: [1024, 2048],
            unit: "B/s",
            sampleTimestampMilliseconds: 1000,
        }),
        maximumBytesPerSecond: 4096,
        label: "DISK",
        currentTimestampMilliseconds: 7001,
        pollingFrequencySeconds: 1,
    });

    assert.equal(widgetData.current, 0);
    assert.deepEqual(widgetData.history, []);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 1024 * 1024,
    });
    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
});

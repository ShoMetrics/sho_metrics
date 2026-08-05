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
        displayMode: "usedPercentage",
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

test.each([
    {
        displayMode: "usedPercentage" as const,
        displayValue: "56",
        unit: "%",
        secondaryDisplayValue: "18 / 32 GB",
        barWideSecondaryDisplayValue: undefined,
        valueQualifierText: undefined,
        barDisplayValue: undefined,
        barUnit: undefined,
    },
    {
        displayMode: "usedCapacity" as const,
        displayValue: "18",
        unit: "GB",
        secondaryDisplayValue: "18 / 32 GB",
        barWideSecondaryDisplayValue: "18 / 32 GB, 56% Used",
        valueQualifierText: "Used",
        barDisplayValue: undefined,
        barUnit: undefined,
    },
    {
        displayMode: "freeCapacity" as const,
        displayValue: "14",
        unit: "GB",
        secondaryDisplayValue: "18 / 32 GB",
        barWideSecondaryDisplayValue: "18 / 32 GB, 56% Used",
        valueQualifierText: "Free",
        barDisplayValue: undefined,
        barUnit: undefined,
    },
])("memory $displayMode changes text without changing percentage geometry", (expected) => {
    const widgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({
            current: 18 * 1024 ** 3,
            history: [8 * 1024 ** 3, 18 * 1024 ** 3],
            unit: "B",
        }),
        totalBytes: 32 * 1024 ** 3,
        label: "RAM",
        displayMode: expected.displayMode,
    });

    assert.equal(widgetData.displayValue, expected.displayValue);
    assert.equal(widgetData.unit, expected.unit);
    assert.equal(widgetData.secondaryDisplayValue, expected.secondaryDisplayValue);
    assert.equal(widgetData.barWideSecondaryDisplayValue, expected.barWideSecondaryDisplayValue);
    assert.equal(widgetData.valueQualifierText, expected.valueQualifierText);
    assert.equal(widgetData.barDisplayValue, expected.barDisplayValue);
    assert.equal(widgetData.barUnit, expected.barUnit);
    assert.equal(widgetData.current, 56.25);
    assert.equal(widgetData.progress, 0.5625);
    assert.deepEqual(widgetData.history, [25, 56.25]);
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});

test("memory free capacity clamps to zero", () => {
    const widgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({ current: 2 * 1024 ** 3, unit: "B" }),
        totalBytes: 1024 ** 3,
        label: "RAM",
        displayMode: "freeCapacity",
    });

    assert.equal(widgetData.displayValue, "0.0");
    assert.equal(widgetData.valueQualifierText, "Free");
    assert.equal(widgetData.secondaryDisplayValue, "2.0 / 1.0 GB");
});

test("memory capacity preserves the existing zero-total guard", () => {
    const widgetData = buildMemoryUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({ current: 0, unit: "B" }),
        totalBytes: 0,
        label: "RAM",
        displayMode: "freeCapacity",
    });

    assert.equal(widgetData.displayValue, "0.0");
    assert.ok(Number.isFinite(widgetData.current));
    assert.ok(Number.isFinite(widgetData.progress));
});

test.each([
    {
        displayMode: "usedPercentage" as const,
        displayValue: "75",
        unit: "%",
        valueQualifierText: undefined,
        barWideSecondaryDisplayValue: undefined,
    },
    {
        displayMode: "usedCapacity" as const,
        displayValue: "1.5",
        unit: "GB",
        valueQualifierText: "Used",
        barWideSecondaryDisplayValue: "1.5 / 2.0 GB, 75% Used",
    },
    {
        displayMode: "freeCapacity" as const,
        displayValue: "512",
        unit: "MB",
        valueQualifierText: "Free",
        barWideSecondaryDisplayValue: "1.5 / 2.0 GB, 75% Used",
    },
])("disk $displayMode changes text without changing used-percentage geometry", (expected) => {
    const widgetData = buildDiskUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({
            current: 1.5 * 1024 ** 3,
            history: [1024 ** 3, 1.5 * 1024 ** 3],
            unit: "B",
        }),
        totalBytes: 2 * 1024 ** 3,
        availableBytes: 512 * 1024 ** 2,
        displayMode: expected.displayMode,
        label: "DISK",
        barLabel: "USED",
    });

    assert.equal(widgetData.current, 75);
    assert.equal(widgetData.progress, 0.75);
    assert.deepEqual(widgetData.history, [50, 75]);
    assert.equal(widgetData.displayValue, expected.displayValue);
    assert.equal(widgetData.unit, expected.unit);
    assert.equal(widgetData.valueQualifierText, expected.valueQualifierText);
    assert.equal(widgetData.barWideSecondaryDisplayValue, expected.barWideSecondaryDisplayValue);
    assert.equal(widgetData.secondaryDisplayValue, "1.5 / 2.0 GB");
    assert.equal(widgetData.barLabel, "USED");
    assert.equal(widgetData.barDisplayValue, undefined);
    assert.equal(widgetData.barUnit, undefined);
});

test("disk free capacity uses the source's available bytes and clamps invalid negative values", () => {
    const widgetData = buildDiskUsageWidgetData({
        usedBytesWidgetData: buildWidgetDataFixture({ current: 6 * 1024 ** 3, unit: "B" }),
        totalBytes: 10 * 1024 ** 3,
        availableBytes: -1,
        displayMode: "freeCapacity",
        label: "DISK",
    });

    assert.equal(widgetData.displayValue, "0.0");
    assert.equal(widgetData.unit, "MB");
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

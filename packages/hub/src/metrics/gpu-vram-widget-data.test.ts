import assert from "node:assert/strict";
import { test } from "vitest";
import type { WidgetData } from "../view-rendering/widget-data";
import { buildGpuVramWidgetData } from "./gpu-vram-widget-data";

const BYTES_PER_GIBIBYTE = 1024 ** 3;

test("GPU VRAM widget data formats byte readings as memory capacity", () => {
    const widgetData = buildGpuVramWidgetData(
        buildWidgetData({
            current: 4.5 * BYTES_PER_GIBIBYTE,
            history: [0, 4.5 * BYTES_PER_GIBIBYTE],
            unit: "B",
        }),
        32 * BYTES_PER_GIBIBYTE,
        {
            displayMode: "usedPercentage",
        },
    );

    assert.equal(widgetData.displayValue, "14");
    assert.equal(widgetData.secondaryDisplayValue, "4.5 / 32 GB");
    assert.equal(widgetData.progress, 0.140625);
    assert.deepEqual(widgetData.history, [0, 14.0625]);
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
    },
    {
        displayMode: "usedCapacity" as const,
        displayValue: "18",
        unit: "GB",
        secondaryDisplayValue: "18 / 32 GB",
        barWideSecondaryDisplayValue: "18 / 32 GB, 56% Used",
        valueQualifierText: "Used",
        barDisplayValue: undefined,
    },
    {
        displayMode: "freeCapacity" as const,
        displayValue: "14",
        unit: "GB",
        secondaryDisplayValue: "18 / 32 GB",
        barWideSecondaryDisplayValue: "18 / 32 GB, 56% Used",
        valueQualifierText: "Free",
        barDisplayValue: undefined,
    },
])("GPU VRAM $displayMode changes text without changing percentage geometry", (expected) => {
    const widgetData = buildGpuVramWidgetData(
        buildWidgetData({
            current: 18 * BYTES_PER_GIBIBYTE,
            history: [8 * BYTES_PER_GIBIBYTE, 18 * BYTES_PER_GIBIBYTE],
            unit: "B",
        }),
        32 * BYTES_PER_GIBIBYTE,
        {
            displayMode: expected.displayMode,
        },
    );

    assert.equal(widgetData.displayValue, expected.displayValue);
    assert.equal(widgetData.unit, expected.unit);
    assert.equal(widgetData.secondaryDisplayValue, expected.secondaryDisplayValue);
    assert.equal(widgetData.barWideSecondaryDisplayValue, expected.barWideSecondaryDisplayValue);
    assert.equal(widgetData.valueQualifierText, expected.valueQualifierText);
    assert.equal(widgetData.barDisplayValue, expected.barDisplayValue);
    assert.equal(widgetData.barUnit, undefined);
    assert.equal(widgetData.current, 56.25);
    assert.equal(widgetData.progress, 0.5625);
    assert.deepEqual(widgetData.history, [25, 56.25]);
});

test("GPU VRAM free capacity clamps to zero", () => {
    const widgetData = buildGpuVramWidgetData(
        buildWidgetData({ current: 2 * BYTES_PER_GIBIBYTE }),
        BYTES_PER_GIBIBYTE,
        {
            displayMode: "freeCapacity",
        },
    );

    assert.equal(widgetData.displayValue, "0.0");
    assert.equal(widgetData.valueQualifierText, "Free");
    assert.equal(widgetData.secondaryDisplayValue, "2.0 / 1.0 GB");
});

test("GPU VRAM capacity preserves the existing zero-total guard", () => {
    const widgetData = buildGpuVramWidgetData(
        buildWidgetData({ current: 0 }),
        0,
        {
            displayMode: "freeCapacity",
        },
    );

    assert.equal(widgetData.displayValue, "0.0");
    assert.ok(Number.isFinite(widgetData.current));
    assert.ok(Number.isFinite(widgetData.progress));
});

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "",
        label: "VRAM",
        ...options,
    };
}

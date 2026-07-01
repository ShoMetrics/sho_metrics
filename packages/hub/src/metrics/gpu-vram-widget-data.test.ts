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
    );

    assert.equal(widgetData.displayValue, "14");
    assert.equal(widgetData.secondaryDisplayValue, "4.5 / 32 GB");
    assert.equal(widgetData.progress, 0.140625);
    assert.deepEqual(widgetData.history, [0, 14.0625]);
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

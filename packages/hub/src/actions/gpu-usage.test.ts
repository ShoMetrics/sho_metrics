import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetData } from "../rendering/widget-data";
import { buildGpuUsageWidgetData } from "./gpu-usage";

test("GPU usage display value renders as an integer percentage", () => {
    const widgetData = buildGpuUsageWidgetData(buildWidgetData({
        current: 1,
        progress: 0.01,
        history: [0, 1],
    }));

    assert.equal(widgetData.displayValue, "1");
    assert.deepEqual(widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 100,
    });
});

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "GPU",
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

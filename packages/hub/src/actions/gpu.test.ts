import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetData } from "../view-rendering/widget-data";
import type { ResolvedGpuMetricTarget, ResolvedGpuReading } from "../settings/resolved-settings";
import {
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";
import { buildGpuUsageWidgetData, resolveGpuMetricSubscriptionKeys } from "./gpu";

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

test("GPU action subscribes to the active GPU reading metrics", () => {
    const testCases: ReadonlyArray<{
        reading: ResolvedGpuReading;
        metricKeys: readonly string[];
    }> = [
        {
            reading: { kind: "usage" },
            metricKeys: [GPU_USAGE_METRIC_KEY, GPU_MODEL_METRIC_KEY],
        },
        {
            reading: { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
            metricKeys: [GPU_TEMP_METRIC_KEY],
        },
        {
            reading: { kind: "vram" },
            metricKeys: [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY],
        },
        {
            reading: { kind: "power", maximumWatts: 300 },
            metricKeys: [GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY],
        },
    ];

    for (const testCase of testCases) {
        assert.deepEqual(resolveGpuMetricSubscriptionKeys(buildGpuTarget(testCase.reading)), testCase.metricKeys);
    }
});

function buildGpuTarget(reading: ResolvedGpuReading): ResolvedGpuMetricTarget {
    return {
        domain: "gpu",
        gpuId: undefined,
        reading,
    };
}

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

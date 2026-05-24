import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetData } from "../view-rendering/widget-data";
import type { ResolvedCpuMetricTarget, ResolvedCpuReading } from "../settings/resolved-settings";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
} from "../runtime/metric-keys";
import { buildCpuUsageWidgetData, resolveCpuMetricSubscriptionKeys } from "./cpu";

test("CPU usage display value renders as an integer percentage", () => {
    const widgetData = buildCpuUsageWidgetData(buildWidgetData({
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

test("CPU action subscribes to the active CPU reading metrics", () => {
    const testCases: ReadonlyArray<{
        reading: ResolvedCpuReading;
        metricKeys: readonly string[];
    }> = [
        {
            reading: { kind: "usage" },
            metricKeys: [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY],
        },
        {
            reading: { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
            metricKeys: [CPU_TEMP_METRIC_KEY],
        },
        {
            reading: { kind: "power", maximumWatts: 150 },
            metricKeys: [CPU_POWER_METRIC_KEY],
        },
    ];

    for (const testCase of testCases) {
        assert.deepEqual(resolveCpuMetricSubscriptionKeys(buildCpuTarget(testCase.reading)), testCase.metricKeys);
    }
});

function buildCpuTarget(reading: ResolvedCpuReading): ResolvedCpuMetricTarget {
    return {
        domain: "cpu",
        reading,
    };
}

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "CPU",
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

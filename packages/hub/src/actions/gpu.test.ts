import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../view-rendering/widget-data";
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
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import {
    buildGpuUsageWidgetData,
    buildGpuViewOptions,
    buildGpuVramWidgetData,
    resolveGpuMetricSubscriptionKeys,
} from "./gpu";

test("GPU usage display value renders as an integer percentage", () => {
    const sampleTimestampMilliseconds = Date.now();
    const widgetData = buildGpuUsageWidgetData(buildWidgetData({
        current: 1,
        progress: 0.01,
        history: [0, 1],
        sampleTimestampMilliseconds,
    }));

    assert.equal(widgetData.displayValue, "1");
    assert.equal(widgetData.sampleTimestampMilliseconds, sampleTimestampMilliseconds);
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

test("GPU VRAM widget data preserves helper-backed no-data copy", () => {
    const sampleTimestampMilliseconds = Date.now();
    const widgetData = buildGpuVramWidgetData(
        buildWidgetData({
            current: 0,
            progress: 0,
            history: [],
            sampleTimestampMilliseconds,
            unavailableDisplayValue: PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
        }),
        0,
    );

    assert.equal(widgetData.unavailableDisplayValue, PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE);
    assert.equal(widgetData.sampleTimestampMilliseconds, sampleTimestampMilliseconds);
});

test("GPU temperature keeps N/A path when fallback has no value", () => {
    const missingValueOptions = buildGpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "gpu").resolvedSettings,
        target: buildGpuTarget({ kind: "temperature", maximumCelsius: 100, unit: "celsius" }),
        metrics: buildMetricReader({
            [GPU_TEMP_METRIC_KEY]: buildWidgetData({ sampleTimestampMilliseconds: undefined }),
        }),
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });
    const fallbackValueOptions = buildGpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "gpu").resolvedSettings,
        target: buildGpuTarget({ kind: "temperature", maximumCelsius: 100, unit: "celsius" }),
        metrics: buildMetricReader({
            [GPU_TEMP_METRIC_KEY]: buildWidgetData({
                current: 67,
                sampleTimestampMilliseconds: Date.now(),
            }),
        }),
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });

    assert.equal(missingValueOptions.noticeText, undefined);
    assert.equal(fallbackValueOptions.noticeText, undefined);
    assert.equal(fallbackValueOptions.widgetData.current, 67);
});

test("GPU usage keeps N/A path when helper is stopped", () => {
    const viewOptions = buildGpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "gpu").resolvedSettings,
        target: buildGpuTarget({ kind: "usage" }),
        metrics: buildMetricReader({
            [GPU_USAGE_METRIC_KEY]: buildWidgetData({ sampleTimestampMilliseconds: undefined }),
        }),
        helperStatus: { state: "unavailable", reason: "helperStopped" },
    });

    assert.equal(viewOptions.noticeText, undefined);
});

function buildGpuTarget(reading: ResolvedGpuReading): ResolvedGpuMetricTarget {
    return {
        domain: "gpu",
        gpuId: undefined,
        reading,
    };
}

function buildMetricReader(widgetDataByMetricKey: Readonly<Record<string, WidgetData>>): MetricStoreReader {
    return {
        getWidgetData: (metricKey) => widgetDataByMetricKey[metricKey] ?? buildWidgetData(),
        getWidgetDataReadResult: (metricKey): MetricWidgetDataReadResult => {
            const widgetData = widgetDataByMetricKey[metricKey] ?? buildWidgetData();

            return {
                widgetData,
                selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                    ? undefined
                    : "node-system",
            };
        },
        getTextValue: () => undefined,
    };
}

function buildWillAppearEvent(): WillAppearEvent {
    return { action: { id: "gpu-test-action", isDial: () => false } } as unknown as WillAppearEvent;
}

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "%",
        label: options.label ?? "GPU",
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
        unavailableDisplayValue: options.unavailableDisplayValue,
    };
}

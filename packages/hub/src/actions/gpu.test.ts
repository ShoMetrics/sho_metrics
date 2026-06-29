import assert from "node:assert/strict";
import { test } from "vitest";
import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { listMetricReadPlanKeys } from "../runtime/source-routing/metric-read-plan";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../view-rendering/widget-data";
import type {
    ResolvedGpuHardwareSummaryReadings,
    ResolvedGpuMetricTarget,
    ResolvedGpuReading,
} from "../settings/resolved-settings";
import {
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";
import type { MetricCollectionBinding } from "./metric-action";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import {
    Gpu,
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

test("GPU summary action subscribes to default usage, temperature, and VRAM readings", () => {
    const action = new TestGpuAction();
    const event = buildWillAppearEvent(buildGpuSummaryWidgetSettings());

    action.onWillAppear(event);

    assert.deepEqual(action.readMetricKeysForTest(event), [
        GPU_USAGE_METRIC_KEY,
        GPU_TEMP_METRIC_KEY,
        GPU_VRAM_USED_METRIC_KEY,
        GPU_VRAM_TOTAL_METRIC_KEY,
    ]);
    assert.deepEqual(listMetricReadPlanKeys(action.readPlans[0] ?? { metrics: [] }), [
        GPU_TEMP_METRIC_KEY,
        GPU_USAGE_METRIC_KEY,
        GPU_VRAM_TOTAL_METRIC_KEY,
        GPU_VRAM_USED_METRIC_KEY,
    ]);
});

test("GPU summary action subscribes to power limit when power is selected", () => {
    const action = new TestGpuAction();
    const event = buildWillAppearEvent(buildGpuSummaryWidgetSettings([
        { kind: "usage" },
        { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
        { kind: "power", maximumWatts: 300 },
    ]));

    action.onWillAppear(event);

    assert.deepEqual(action.readMetricKeysForTest(event), [
        GPU_USAGE_METRIC_KEY,
        GPU_TEMP_METRIC_KEY,
        GPU_POWER_METRIC_KEY,
        GPU_POWER_LIMIT_METRIC_KEY,
    ]);
    assert.deepEqual(listMetricReadPlanKeys(action.readPlans[0] ?? { metrics: [] }), [
        GPU_POWER_METRIC_KEY,
        GPU_POWER_LIMIT_METRIC_KEY,
        GPU_TEMP_METRIC_KEY,
        GPU_USAGE_METRIC_KEY,
    ]);
});

test("GPU single metric action keeps single-reading subscription behavior", () => {
    const action = new TestGpuAction();
    const event = buildWillAppearEvent();

    action.onWillAppear(event);

    assert.deepEqual(action.readMetricKeysForTest(event), [
        GPU_USAGE_METRIC_KEY,
        GPU_MODEL_METRIC_KEY,
    ]);
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

function buildWillAppearEvent(settings?: unknown): WillAppearEvent {
    return {
        action: {
            id: "gpu-test-action",
            isDial: () => false,
            isKey: () => true,
            setSettings: () => Promise.resolve(),
        },
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildGpuSummaryWidgetSettings(
    orderedReadings?: ResolvedGpuHardwareSummaryReadings,
): unknown {
    return writeStoredWidgetSettingsPatch(undefined, {
        hardwareSummary: {
            switchTo: { widgetKind: "hardwareSummary", domain: "gpu" },
            ...(orderedReadings === undefined ? {} : { orderedReadings }),
        },
    });
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

class TestGpuAction extends Gpu {
    readonly readPlans: Parameters<MetricCollectionBinding["refresh"]>[0]["readPlan"][] = [];

    readMetricKeysForTest(event: WillAppearEvent): readonly string[] {
        return this.getMetricKeys(event);
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        void event;
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        return {
            refresh: options => {
                this.readPlans.push(options.readPlan);
            },
            dispose: () => undefined,
        };
    }
}

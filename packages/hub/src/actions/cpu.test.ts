import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import type { WidgetData } from "../view-rendering/widget-data";
import type { ResolvedCpuMetricTarget, ResolvedCpuReading } from "../settings/resolved-settings";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
} from "../runtime/metric-keys";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { HELPER_INSTALL_NOTICE_TEXT } from "./shared/helper-backed-widget-data";
import { buildCpuUsageWidgetData, buildCpuViewOptions, resolveCpuMetricSubscriptionKeys } from "./cpu";

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

test("CPU temperature shows install-helper notice when helper is not installed", () => {
    const viewOptions = buildCpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "cpu").resolvedSettings,
        target: buildCpuTarget({ kind: "temperature", maximumCelsius: 100, unit: "celsius" }),
        metrics: buildMetricReader(buildWidgetData({ sampleTimestampMilliseconds: undefined })),
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });

    assert.equal(viewOptions.noticeText, HELPER_INSTALL_NOTICE_TEXT);
});

test("CPU power shows install-helper notice when helper is not installed", () => {
    const viewOptions = buildCpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "cpu").resolvedSettings,
        target: buildCpuTarget({ kind: "power", maximumWatts: 150 }),
        metrics: buildMetricReader(buildWidgetData({ sampleTimestampMilliseconds: undefined })),
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });

    assert.equal(viewOptions.noticeText, HELPER_INSTALL_NOTICE_TEXT);
});

test("CPU temperature keeps N/A path when helper is stopped", () => {
    const viewOptions = buildCpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "cpu").resolvedSettings,
        target: buildCpuTarget({ kind: "temperature", maximumCelsius: 100, unit: "celsius" }),
        metrics: buildMetricReader(buildWidgetData({ sampleTimestampMilliseconds: undefined })),
        helperStatus: { state: "unavailable", reason: "helperStopped" },
    });

    assert.equal(viewOptions.noticeText, undefined);
});

test("CPU temperature keeps value when helper data is fresh", () => {
    const viewOptions = buildCpuViewOptions({
        event: buildWillAppearEvent(),
        settings: resolveInitialActionSettings(undefined, "cpu").resolvedSettings,
        target: buildCpuTarget({ kind: "temperature", maximumCelsius: 100, unit: "celsius" }),
        metrics: buildMetricReader(buildWidgetData({
            current: 55,
            sampleTimestampMilliseconds: Date.now(),
        })),
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });

    assert.equal(viewOptions.noticeText, undefined);
    assert.equal(viewOptions.widgetData.current, 55);
});

function buildCpuTarget(reading: ResolvedCpuReading): ResolvedCpuMetricTarget {
    return {
        domain: "cpu",
        reading,
    };
}

function buildMetricReader(widgetData: WidgetData): MetricStoreReader {
    return {
        getWidgetData: () => widgetData,
        getWidgetDataWithAttribution: (): MetricWidgetDataReadResult => ({
            widgetData,
            selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                ? undefined
                : "node-system",
        }),
        getTextValue: () => undefined,
    };
}

function buildWillAppearEvent(): WillAppearEvent {
    return { action: { id: "cpu-test-action", isDial: () => false } } as unknown as WillAppearEvent;
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

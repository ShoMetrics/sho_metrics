import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveInitialActionSettings } from "../settings/action-settings-resolver";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../../runtime/metric-store";
import {
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import {
    requireResolvedHardwareSummaryWidget,
    type ResolvedCpuHardwareSummaryReadings,
    type ResolvedGpuHardwareSummaryReadings,
    type ResolvedHardwareSummaryWidget,
} from "../../settings/resolved-settings";
import { writeStoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import type { WidgetData } from "../../view-rendering/widget-data";
import { buildHardwareSummaryWidgetData } from "./widget-data";

test("primary VRAM progress uses used over total memory", () => {
    const widget = buildHardwareSummaryWidget("gpu", [
        { kind: "vram" },
        { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
        { kind: "usage" },
    ]);
    const widgetData = buildHardwareSummaryWidgetData({
        widget,
        metrics: buildMetricReader({
            [GPU_VRAM_USED_METRIC_KEY]: buildMetricValue({ current: 4096, unit: "MB" }),
            [GPU_VRAM_TOTAL_METRIC_KEY]: buildMetricValue({ current: 8192, unit: "MB" }),
            [GPU_TEMP_METRIC_KEY]: buildMetricValue({ current: 70, unit: "C" }),
            [GPU_USAGE_METRIC_KEY]: buildMetricValue({ current: 42, unit: "%" }),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(widgetData.primary.kind, "vram");
    assert.equal(widgetData.primary.displayValue, "50");
    assert.equal(widgetData.primary.unit, "%");
    assert.equal(widgetData.primary.progress, 0.5);
});

test("primary GPU power progress follows resolved maximum watts", () => {
    const widget = buildHardwareSummaryWidget("gpu", [
        { kind: "power", maximumWatts: 300 },
        { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
        { kind: "usage" },
    ]);
    const widgetData = buildHardwareSummaryWidgetData({
        widget,
        metrics: buildMetricReader({
            [GPU_POWER_METRIC_KEY]: buildMetricValue({ current: 150, unit: "W" }),
            [GPU_TEMP_METRIC_KEY]: buildMetricValue({ current: 70, unit: "C" }),
            [GPU_USAGE_METRIC_KEY]: buildMetricValue({ current: 42, unit: "%" }),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(widgetData.primary.kind, "power");
    assert.equal(widgetData.primary.displayValue, "150");
    assert.equal(widgetData.primary.unit, "W");
    assert.equal(widgetData.primary.progress, 0.5);
});

test("missing secondary reading degrades only that secondary reading", () => {
    const widget = buildHardwareSummaryWidget("cpu", [
        { kind: "usage" },
        { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
        { kind: "power", maximumWatts: 200 },
    ]);
    const widgetData = buildHardwareSummaryWidgetData({
        widget,
        metrics: buildMetricReader({
            [CPU_USAGE_METRIC_KEY]: buildMetricValue({ current: 55, unit: "%" }),
            [CPU_TEMP_METRIC_KEY]: buildMetricValue({ current: 0, unit: "C", sampleTimestampMilliseconds: undefined }),
            [CPU_POWER_METRIC_KEY]: buildMetricValue({ current: 80, unit: "W" }),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(widgetData.primary.displayValue, "55");
    assert.equal(widgetData.secondary[0].kind, "temperature");
    assert.equal(widgetData.secondary[0].displayValue, "N/A");
    assert.equal(widgetData.secondary[0].sampleTimestampMilliseconds, undefined);
    assert.equal(widgetData.secondary[1].kind, "power");
    assert.equal(widgetData.secondary[1].displayValue, "80");
});

test("secondary readings do not expose progress", () => {
    const widget = buildHardwareSummaryWidget("cpu");
    const widgetData = buildHardwareSummaryWidgetData({
        widget,
        metrics: buildMetricReader({
            [CPU_USAGE_METRIC_KEY]: buildMetricValue({ current: 55, unit: "%" }),
            [CPU_TEMP_METRIC_KEY]: buildMetricValue({ current: 70, unit: "C" }),
            [CPU_POWER_METRIC_KEY]: buildMetricValue({ current: 80, unit: "W" }),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal("progress" in widgetData.secondary[0], false);
    assert.equal("progress" in widgetData.secondary[1], false);
});

function buildHardwareSummaryWidget(
    domain: "cpu",
    orderedReadings?: ResolvedCpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget;
function buildHardwareSummaryWidget(
    domain: "gpu",
    orderedReadings?: ResolvedGpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget;
function buildHardwareSummaryWidget(
    domain: "cpu" | "gpu",
    orderedReadings?: ResolvedCpuHardwareSummaryReadings | ResolvedGpuHardwareSummaryReadings,
): ResolvedHardwareSummaryWidget {
    const rawSettings = writeStoredWidgetSettingsPatch(undefined, {
        hardwareSummary: {
            switchTo: { widgetKind: "hardwareSummary", domain },
            ...(orderedReadings === undefined ? {} : { orderedReadings }),
        },
    });
    const resolvedSettings = resolveInitialActionSettings(rawSettings, domain).resolvedSettings;

    return requireResolvedHardwareSummaryWidget(resolvedSettings);
}

function buildMetricReader(widgetDataByMetricKey: Readonly<Record<string, WidgetData>>): MetricStoreReader {
    return {
        getWidgetData: (metricKey, label, unit, maxValue) => {
            const widgetData = widgetDataByMetricKey[metricKey]
                ?? buildMetricValue({ current: 0, unit, sampleTimestampMilliseconds: undefined });

            return {
                ...widgetData,
                label,
                unit,
                progress: Math.min(Math.max(widgetData.current / (maxValue ?? 100), 0), 1),
            };
        },
        getWidgetDataReadResult: (metricKey, label, unit, maxValue): MetricWidgetDataReadResult => {
            const widgetData = widgetDataByMetricKey[metricKey]
                ?? buildMetricValue({ current: 0, unit, sampleTimestampMilliseconds: undefined });
            const renderedWidgetData = {
                ...widgetData,
                label,
                unit,
                progress: Math.min(Math.max(widgetData.current / (maxValue ?? 100), 0), 1),
            };

            return {
                widgetData: renderedWidgetData,
                selectedSourceId: renderedWidgetData.sampleTimestampMilliseconds === undefined
                    ? undefined
                    : "node-system",
            };
        },
        getTextValue: () => undefined,
    };
}

function buildMetricValue(options: {
    readonly current: number;
    readonly unit: string;
    readonly sampleTimestampMilliseconds?: number | undefined;
}): WidgetData {
    const sampleTimestampMilliseconds = Object.hasOwn(options, "sampleTimestampMilliseconds")
        ? options.sampleTimestampMilliseconds
        : Date.now();

    return {
        current: options.current,
        progress: Math.min(Math.max(options.current / 100, 0), 1),
        history: [options.current],
        unit: options.unit,
        label: "TEST",
        sampleTimestampMilliseconds,
    };
}

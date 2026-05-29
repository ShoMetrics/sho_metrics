import assert from "node:assert/strict";
import test from "node:test";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../../runtime/metric-store";
import type { WidgetData } from "../../view-rendering/widget-data";
import { readHelperBackedWidgetData } from "./helper-backed-widget-data";

test("helper-backed widget data keeps fresh samples", () => {
    const widgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            sampleTimestampMilliseconds: Date.now(),
        }),
        metricKey: "cpu.temp",
        label: "CPU",
        unit: "C",
        helperStatus: { state: "available" },
    });

    assert.equal(widgetData.current, 42);
    assert.deepEqual(widgetData.history, [40, 42]);
    assert.equal(widgetData.unavailableDisplayValue, undefined);
});

test("helper-backed widget data transforms only fresh samples", () => {
    const freshWidgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            sampleTimestampMilliseconds: Date.now(),
        }),
        metricKey: "gpu.power",
        label: "GPU",
        unit: "W",
        helperStatus: { state: "available" },
        transformFreshWidgetData: (widgetData) => ({
            ...widgetData,
            displayValue: "fresh",
        }),
    });
    const staleWidgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            sampleTimestampMilliseconds: 1,
        }),
        metricKey: "gpu.power",
        label: "GPU",
        unit: "W",
        helperStatus: { state: "available" },
        transformFreshWidgetData: (widgetData) => ({
            ...widgetData,
            displayValue: "stale",
        }),
    });

    assert.equal(freshWidgetData.displayValue, "fresh");
    assert.equal(staleWidgetData.displayValue, undefined);
    assert.equal(staleWidgetData.unavailableDisplayValue, "No sensor data");
});

test("helper-backed widget data explains missing helper when sample is stale", () => {
    const widgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            displayValue: "42",
            sampleTimestampMilliseconds: 1,
        }),
        metricKey: "gpu.temp",
        label: "GPU",
        unit: "C",
        helperStatus: { state: "unavailable", reason: "pipeMissing" },
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.progress, 0);
    assert.deepEqual(widgetData.history, []);
    assert.equal(widgetData.displayValue, undefined);
    assert.equal(widgetData.sampleTimestampMilliseconds, undefined);
    assert.equal(widgetData.unavailableDisplayValue, "Helper required");
});

test("helper-backed widget data explains broken helper after a previous successful connection", () => {
    const widgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({ sampleTimestampMilliseconds: undefined }),
        metricKey: "cpu.temp",
        label: "CPU",
        unit: "C",
        helperStatus: {
            state: "unavailable",
            reason: "pipeMissing",
            lastSuccessAtTimestampMilliseconds: 1000,
        },
    });

    assert.equal(widgetData.unavailableDisplayValue, "Helper error");
});

test("helper-backed widget data keeps default N/A copy when helper source is not registered", () => {
    const widgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            sampleTimestampMilliseconds: 1,
        }),
        metricKey: "gpu.temp",
        label: "GPU",
        unit: "C",
        helperStatus: undefined,
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.unavailableDisplayValue, undefined);
});

test("helper-backed widget data keeps default N/A copy before helper status is known", () => {
    const widgetData = readHelperBackedWidgetData({
        metrics: buildMetricReader({
            current: 42,
            progress: 0.42,
            history: [40, 42],
            sampleTimestampMilliseconds: 1,
        }),
        metricKey: "gpu.temp",
        label: "GPU",
        unit: "C",
        helperStatus: { state: "unknown" },
    });

    assert.equal(widgetData.current, 0);
    assert.equal(widgetData.unavailableDisplayValue, undefined);
});

test("helper-backed widget data reports no sensor data after the helper is reachable", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader({ sampleTimestampMilliseconds: undefined }),
            metricKey: "cpu.power",
            label: "CPU",
            unit: "W",
            helperStatus: { state: "available" },
        }).unavailableDisplayValue,
        "No sensor data",
    );
});

test("helper-backed widget data reports helper errors after helper failures", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader({ sampleTimestampMilliseconds: undefined }),
            metricKey: "cpu.power",
            label: "CPU",
            unit: "W",
            helperStatus: { state: "unavailable", reason: "sourceError" },
        }).unavailableDisplayValue,
        "Helper error",
    );
});

function buildMetricReader(widgetData: Partial<WidgetData>): MetricStoreReader {
    const fullWidgetData = buildWidgetData(widgetData);

    return {
        getWidgetData: () => fullWidgetData,
        getWidgetDataWithAttribution: (): MetricWidgetDataReadResult => ({
            widgetData: fullWidgetData,
            selectedSourceId: "local:windows-helper",
        }),
        getTextValue: () => undefined,
    };
}

function buildWidgetData(options: Partial<WidgetData>): WidgetData {
    return {
        current: options.current ?? 0,
        progress: options.progress ?? 0,
        history: options.history ?? [],
        unit: options.unit ?? "C",
        label: options.label ?? "CPU",
        displayValue: options.displayValue,
        secondaryDisplayValue: options.secondaryDisplayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds,
    };
}

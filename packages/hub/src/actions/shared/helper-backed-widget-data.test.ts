import assert from "node:assert/strict";
import { test } from "vitest";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../../runtime/metric-store";
import {
    CPU_TEMP_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
} from "../../runtime/metric-keys";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../../view-rendering/widget-data";
import {
    HELPER_INSTALL_NOTICE_TEXT,
    readHelperBackedWidgetData,
    resolveBuiltInHelperInstallNoticeText,
    resolveHelperRequiredInstallNoticeText,
} from "./helper-backed-widget-data";

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
    assert.equal(staleWidgetData.unavailableDisplayValue, undefined);
});

test("helper-backed widget data keeps default N/A copy when helper was never reached", () => {
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
    assert.equal(widgetData.unavailableDisplayValue, undefined);
});

test("helper-backed widget data keeps default N/A copy after a previous helper connection", () => {
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

    assert.equal(widgetData.unavailableDisplayValue, undefined);
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

test("helper-backed widget data keeps default N/A copy after the helper is reachable", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader({ sampleTimestampMilliseconds: undefined }),
            metricKey: "cpu.power",
            label: "CPU",
            unit: "W",
            helperStatus: { state: "available" },
        }).unavailableDisplayValue,
        undefined,
    );
});

test("helper-backed widget data surfaces pending refresh as loading copy", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader(
                { sampleTimestampMilliseconds: undefined },
                { metricId: "cpu.temp", reason: "pendingRefresh" },
            ),
            metricKey: "cpu.temp",
            label: "CPU",
            unit: "C",
            helperStatus: { state: "available" },
        }).unavailableDisplayValue,
        PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    );
});

test("helper-backed widget data keeps default N/A copy for helper failures over pending metadata", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader(
                { sampleTimestampMilliseconds: undefined },
                { metricId: "cpu.temp", reason: "pendingRefresh" },
            ),
            metricKey: "cpu.temp",
            label: "CPU",
            unit: "C",
            helperStatus: { state: "unavailable", reason: "sourceError" },
        }).unavailableDisplayValue,
        undefined,
    );
});

test("helper-backed widget data keeps default N/A copy for helper install failures over pending metadata", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader(
                { sampleTimestampMilliseconds: undefined },
                { metricId: "cpu.temp", reason: "pendingRefresh" },
            ),
            metricKey: "cpu.temp",
            label: "CPU",
            unit: "C",
            helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
        }).unavailableDisplayValue,
        undefined,
    );
});

test("helper-backed widget data keeps default N/A copy after helper failures", () => {
    assert.equal(
        readHelperBackedWidgetData({
            metrics: buildMetricReader({ sampleTimestampMilliseconds: undefined }),
            metricKey: "cpu.power",
            label: "CPU",
            unit: "W",
            helperStatus: { state: "unavailable", reason: "sourceError" },
        }).unavailableDisplayValue,
        undefined,
    );
});

test("helper-required install notice appears only for confirmed missing helper without a value", () => {
    assert.equal(
        resolveHelperRequiredInstallNoticeText({
            helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: undefined }),
        }),
        HELPER_INSTALL_NOTICE_TEXT,
    );
    assert.equal(
        resolveHelperRequiredInstallNoticeText({
            helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: Date.now() }),
        }),
        undefined,
    );
    assert.equal(
        resolveHelperRequiredInstallNoticeText({
            helperStatus: { state: "unavailable", reason: "helperStopped" },
            widgetData: buildWidgetData({ sampleTimestampMilliseconds: undefined }),
        }),
        undefined,
    );
});

test("built-in install notice follows static helper-only source routing", () => {
    const helperNotInstalledStatus = { state: "unavailable", reason: "helperNotInstalled" } as const;
    const missingWidgetData = buildWidgetData({ sampleTimestampMilliseconds: undefined });

    assert.equal(
        resolveBuiltInHelperInstallNoticeText({
            metricKey: CPU_TEMP_METRIC_KEY,
            helperStatus: helperNotInstalledStatus,
            widgetData: missingWidgetData,
        }),
        HELPER_INSTALL_NOTICE_TEXT,
    );
    assert.equal(
        resolveBuiltInHelperInstallNoticeText({
            metricKey: GPU_TEMP_METRIC_KEY,
            helperStatus: helperNotInstalledStatus,
            widgetData: missingWidgetData,
        }),
        undefined,
    );
});

function buildMetricReader(
    widgetData: Partial<WidgetData>,
    unavailableMetric?: MetricWidgetDataReadResult["unavailableMetric"],
): MetricStoreReader {
    const fullWidgetData = buildWidgetData(widgetData);

    return {
        getWidgetData: () => fullWidgetData,
        getWidgetDataReadResult: (): MetricWidgetDataReadResult => ({
            widgetData: fullWidgetData,
            selectedSourceId: "local:windows-helper",
            ...(unavailableMetric === undefined ? {} : { unavailableMetric }),
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

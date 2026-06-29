import assert from "node:assert/strict";
import { test } from "vitest";
import type { KeyDownEvent, WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { listMetricReadPlanKeys } from "../runtime/source-routing/metric-read-plan";
import type { WidgetData } from "../view-rendering/widget-data";
import type { ResolvedCpuMetricTarget, ResolvedCpuReading } from "../settings/resolved-settings";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
} from "../runtime/metric-keys";
import type { MetricCollectionBinding } from "./metric-action";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import { HELPER_INSTALL_NOTICE_TEXT } from "./shared/helper-backed-widget-data";
import { buildCpuUsageWidgetData, buildCpuViewOptions, Cpu, resolveCpuMetricSubscriptionKeys } from "./cpu";

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

test("CPU summary action subscribes to all three summary readings", () => {
    const action = new TestCpuAction();
    const event = buildWillAppearEvent(buildCpuSummaryWidgetSettings());

    action.onWillAppear(event);

    assert.deepEqual(action.readMetricKeysForTest(event), [
        CPU_USAGE_METRIC_KEY,
        CPU_TEMP_METRIC_KEY,
        CPU_POWER_METRIC_KEY,
    ]);
    assert.deepEqual(listMetricReadPlanKeys(action.readPlans[0] ?? { metrics: [] }), [
        CPU_POWER_METRIC_KEY,
        CPU_TEMP_METRIC_KEY,
        CPU_USAGE_METRIC_KEY,
    ]);
});

test("CPU summary action requests manual refresh for the summary subscriber", () => {
    const action = new TestCpuAction();
    const event = buildWillAppearEvent(buildCpuSummaryWidgetSettings());

    action.onWillAppear(event);
    action.onKeyDown(buildKeyDownEvent("cpu-test-action"));

    assert.deepEqual(action.subscriberRefreshActionIds, ["cpu-test-action"]);
});

test("CPU single metric action keeps single-reading subscription behavior", () => {
    const action = new TestCpuAction();
    const event = buildWillAppearEvent();

    action.onWillAppear(event);

    assert.deepEqual(action.readMetricKeysForTest(event), [
        CPU_USAGE_METRIC_KEY,
        CPU_MODEL_METRIC_KEY,
    ]);
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
        getWidgetDataReadResult: (): MetricWidgetDataReadResult => ({
            widgetData,
            selectedSourceId: widgetData.sampleTimestampMilliseconds === undefined
                ? undefined
                : "node-system",
        }),
        getTextValue: () => undefined,
    };
}

function buildWillAppearEvent(settings?: unknown): WillAppearEvent {
    return {
        action: {
            id: "cpu-test-action",
            isDial: () => false,
            isKey: () => true,
            setSettings: () => Promise.resolve(),
        },
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildKeyDownEvent(actionId: string): KeyDownEvent {
    return { action: { id: actionId } } as unknown as KeyDownEvent;
}

function buildCpuSummaryWidgetSettings(): unknown {
    return writeStoredWidgetSettingsPatch(undefined, {
        hardwareSummary: {
            switchTo: { widgetKind: "hardwareSummary", domain: "cpu" },
        },
    });
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

class TestCpuAction extends Cpu {
    readonly readPlans: Parameters<MetricCollectionBinding["refresh"]>[0]["readPlan"][] = [];
    readonly subscriberRefreshActionIds: string[] = [];

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

    protected override requestSubscriberRefresh(actionId: string): Promise<void> {
        this.subscriberRefreshActionIds.push(actionId);
        return Promise.resolve();
    }
}

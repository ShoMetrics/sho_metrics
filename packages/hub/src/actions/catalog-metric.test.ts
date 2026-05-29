import assert from "node:assert/strict";
import test from "node:test";
import type { PropertyInspectorDidAppearEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import {
    buildCatalogMetricNoSelectionViewOptions,
    buildCatalogMetricSelectedViewOptions,
    CatalogMetric,
} from "./catalog-metric";
import type { MetricCollectionBinding } from "./metric-action";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { listMetricReadPlanKeys } from "../runtime/source-routing/metric-read-plan";
import { MetricUnit } from "../runtime/sources/metric-source";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
    type MetricDescriptorSnapshot,
} from "../runtime/sources/source-client";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import type { WidgetData } from "../view-rendering/widget-data";
import { wallClockNowMilliseconds } from "../shared/clock";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/widget-settings-patch";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";

test("catalog metric without selected metric does not register collection", () => {
    const action = new TestCatalogMetric();
    const streamDeckAction = new FakeStreamDeckAction("catalog-empty-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCatalogWidgetSettings("")));

        assert.equal(action.bindings.length, 0);
        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric with selected metric registers exactly one metric key", () => {
    const action = new TestCatalogMetric();
    const streamDeckAction = new FakeStreamDeckAction("catalog-selected-action");

    try {
        action.onWillAppear(buildWillAppearEvent(
            streamDeckAction,
            buildCatalogWidgetSettings("source.sensor:/gpu/0/temperature"),
        ));

        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 1);
        assert.deepEqual(
            listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan),
            ["source.sensor:/gpu/0/temperature"],
        );
        assert.deepEqual(action.bindings[0].refreshOptionsList[0].metricSubscriptions[0]?.sourceCandidates, [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
        ]);
        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric publishes helper descriptors to runtime cache", async () => {
    const descriptor = buildMetricDescriptor("source.sensor:/gpu/0/temperature");
    const action = new TestCatalogMetric({
        descriptors: [descriptor],
        descriptorFingerprint: "catalog-fingerprint",
    });
    const streamDeckAction = new FakeStreamDeckAction("catalog-descriptor-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCatalogWidgetSettings("")));
        await action.refreshCatalogMetricDescriptorsForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                availableCatalogMetricDescriptors: [descriptor],
                catalogMetricDescriptorLoadState: "ready",
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric publishes failed descriptor status", async () => {
    const action = new TestCatalogMetric(new Error("helper unavailable"));
    const streamDeckAction = new FakeStreamDeckAction("catalog-descriptor-failed-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCatalogWidgetSettings("")));
        await action.refreshCatalogMetricDescriptorsForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                availableCatalogMetricDescriptors: [],
                catalogMetricDescriptorLoadState: "failed",
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric no-selection view renders placeholder without reading metrics", () => {
    const rawSettings = buildCatalogWidgetSettings("");
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({});

    const viewOptions = buildCatalogMetricNoSelectionViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-empty-action"), rawSettings),
        settings,
    });

    assert.equal(viewOptions.metricKey, "catalog.unselected");
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, "Choose metric");
    assert.deepEqual(metricReader.widgetDataCalls, []);
});

test("catalog metric selected view uses stored fallback label unit and unit maximum", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/power", {
        fallbackLabel: "GPU Board Power",
        fallbackUnit: "W",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 150,
        sampleTimestampMilliseconds: wallClockNowMilliseconds(),
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-selected-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });

    assert.equal(viewOptions.metricKey, "source.sensor:/gpu/0/power");
    assert.deepEqual(metricReader.widgetDataCalls, [
        {
            metricKey: "source.sensor:/gpu/0/power",
            label: "GPU Board Power",
            unit: "W",
            maxValue: 300,
        },
    ]);
    assert.equal(viewOptions.widgetData.current, 150);
    assert.equal(viewOptions.widgetData.progress, 0.5);
    assert.equal(viewOptions.widgetData.label, "GPU Board Power");
    assert.equal(viewOptions.widgetData.unit, "W");
});

test("catalog metric selected view reports no sensor data through helper backed copy", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/temperature", {
        fallbackLabel: "GPU Hot Spot",
        fallbackUnit: "C",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 72,
        sampleTimestampMilliseconds: undefined,
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-no-data-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });

    assert.equal(viewOptions.widgetData.current, 0);
    assert.equal(viewOptions.widgetData.progress, 0);
    assert.deepEqual(viewOptions.widgetData.history, []);
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, "No sensor data");
});

test("catalog metric selected view uses 100 as the percent maximum", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/network/load", {
        fallbackLabel: "Network Utilization",
        fallbackUnit: "%",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 42,
        sampleTimestampMilliseconds: wallClockNowMilliseconds(),
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-percent-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });

    assert.equal(metricReader.widgetDataCalls[0]?.maxValue, 100);
    assert.equal(viewOptions.widgetData.progress, 0.42);
});

test("catalog metric selected view renders non-percent scalar units without descriptor metadata", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/fan/0/rpm", {
        fallbackLabel: "Fan",
        fallbackUnit: "RPM",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 1500,
        sampleTimestampMilliseconds: wallClockNowMilliseconds(),
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-rpm-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });

    assert.equal(metricReader.widgetDataCalls[0]?.maxValue, 3000);
    assert.equal(viewOptions.widgetData.progress, 0.5);
});

class TestCatalogMetric extends CatalogMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    metricsUpdateCallCount = 0;

    constructor(private descriptorReadResult: MetricDescriptorSnapshot | Error = {
        descriptors: [],
        descriptorFingerprint: "empty-catalog",
    }) {
        super();
    }

    refreshCatalogMetricDescriptorsForTest(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return this.refreshCatalogMetricDescriptorsForPropertyInspector(event);
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        void event;
        this.metricsUpdateCallCount += 1;
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        void event;
        return undefined;
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = new FakeMetricCollectionBinding();
        this.bindings.push(binding);
        return binding;
    }

    protected override readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        if (this.descriptorReadResult instanceof Error) {
            return Promise.reject(this.descriptorReadResult);
        }

        return Promise.resolve(this.descriptorReadResult);
    }

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        void event;
        this.runtimeCachePatchList.push(patch);
        return Promise.resolve();
    }
}

interface WidgetDataCall {
    readonly metricKey: string;
    readonly label: string;
    readonly unit: string;
    readonly maxValue: number | undefined;
}

class CapturingMetricStoreReader implements MetricStoreReader {
    readonly widgetDataCalls: WidgetDataCall[] = [];

    constructor(private readonly widgetDataOptions: Partial<WidgetData>) {}

    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData {
        this.widgetDataCalls.push({ metricKey, label, unit, maxValue });

        const current = this.widgetDataOptions.current ?? 0;
        const safeMaxValue = maxValue ?? 100;

        return {
            current,
            progress: Math.min(Math.max(current / safeMaxValue, 0), 1),
            history: this.widgetDataOptions.history ?? [current],
            label,
            unit,
            sampleTimestampMilliseconds: this.widgetDataOptions.sampleTimestampMilliseconds,
        };
    }

    getWidgetDataWithAttribution(
        metricKey: string,
        label: string,
        unit: string,
        maxValue?: number,
    ): MetricWidgetDataReadResult {
        return {
            widgetData: this.getWidgetData(metricKey, label, unit, maxValue),
            selectedSourceId: WINDOWS_HELPER_SOURCE_ID,
        };
    }

    getTextValue(): string | undefined {
        return undefined;
    }
}

class FakeMetricCollectionBinding implements MetricCollectionBinding {
    readonly refreshOptionsList: Parameters<MetricCollectionBinding["refresh"]>[0][] = [];
    disposeCallCount = 0;

    refresh(options: Parameters<MetricCollectionBinding["refresh"]>[0]): void {
        this.refreshOptionsList.push(options);
    }

    dispose(): void {
        this.disposeCallCount += 1;
    }
}

class FakeStreamDeckAction {
    readonly writtenSettingsList: unknown[] = [];

    constructor(readonly id: string) {}

    setSettings(settings: unknown): Promise<void> {
        this.writtenSettingsList.push(settings);
        return Promise.resolve();
    }
}

function buildCatalogWidgetSettings(
    metricId: string,
    options: {
        readonly fallbackLabel?: string;
        readonly fallbackUnit?: string;
    } = {},
): unknown {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings;

    if (metricId.length === 0) {
        return quickStartSettings;
    }

    return writeStoredWidgetSettingsPatch(quickStartSettings, {
        catalog: {
            metricId,
            fallbackLabel: options.fallbackLabel ?? "GPU Hot Spot",
            fallbackUnit: options.fallbackUnit ?? "C",
        },
    });
}

function readCatalogTarget(settings: ReturnType<typeof resolveInitialActionSettings>["resolvedSettings"]) {
    const target = settings.widget.slot.metric.target;

    if (target.domain !== "catalog") {
        assert.fail(`Expected catalog target, received ${target.domain}.`);
    }

    return target;
}

function buildMetricDescriptor(metricId: string): MetricDescriptor {
    return {
        metricId,
        rawSensorIdentity: {
            sourceSensorId: metricId,
            hardwareId: "gpu-0",
            hardwareName: "NVIDIA GPU",
            hardwareType: "GpuNvidia",
            sensorName: "GPU Hot Spot",
            sourceSensorType: "Temperature",
        },
        pollingGroupId: "lhm:hardware:gpu-0",
        valueKind: MetricValueKind.SCALAR,
        unit: MetricUnit.CELSIUS,
        metricIdKind: MetricIdKind.SOURCE_SENSOR,
    };
}

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildPropertyInspectorDidAppearEvent(action: FakeStreamDeckAction): PropertyInspectorDidAppearEvent {
    return { action } as unknown as PropertyInspectorDidAppearEvent;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

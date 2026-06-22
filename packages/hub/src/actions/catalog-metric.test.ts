import assert from "node:assert/strict";
import { test } from "vitest";
import type { PropertyInspectorDidAppearEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import {
    buildCatalogMetricNoSelectionViewOptions,
    buildCatalogMetricSelectedViewOptions,
    CATALOG_CHOOSE_METRIC_NOTICE_TEXT,
    CATALOG_INSTALL_HELPER_NOTICE_TEXT,
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
    type SourceClientStatus,
} from "../runtime/sources/source-client";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import {
    type WidgetData,
} from "../view-rendering/widget-data";
import { wallClockNowMilliseconds } from "../shared/clock";
import {
    requireResolvedSingleMetricWidget,
    type CatalogMetricCategory,
    type CatalogMetricReadingKind,
} from "../settings/resolved-settings";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { getHardwareIconFragment } from "../widgets/icons/hardware-icons";
import { getMetricStatusIcon } from "../widgets/icons/metric-status-icons";

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
        assert.equal(action.metricsUpdateCallCount, 2);
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

test("catalog metric publishes helper status when descriptor loading fails", async () => {
    const helperStatus: SourceClientStatus = {
        state: "unavailable",
        reason: "helperNotInstalled",
    };
    const action = new TestCatalogMetric(new Error("helper unavailable"), helperStatus);
    const streamDeckAction = new FakeStreamDeckAction("catalog-descriptor-helper-status-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCatalogWidgetSettings("")));
        await action.refreshCatalogMetricDescriptorsForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                catalogMetricDescriptorLoadState: "pending",
                catalogMetricDescriptorSourceStatus: helperStatus,
            },
            {
                availableCatalogMetricDescriptors: [],
                catalogMetricDescriptorLoadState: "failed",
                catalogMetricDescriptorSourceStatus: helperStatus,
            },
        ]);
        assert.equal(action.metricsUpdateCallCount, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric descriptor status does not refresh selected keys", async () => {
    const action = new TestCatalogMetric(new Error("helper unavailable"), {
        state: "unavailable",
        reason: "helperNotInstalled",
    });
    const streamDeckAction = new FakeStreamDeckAction("catalog-selected-descriptor-status-action");

    try {
        action.onWillAppear(buildWillAppearEvent(
            streamDeckAction,
            buildCatalogWidgetSettings("source.sensor:/gpu/0/temperature"),
        ));
        await action.refreshCatalogMetricDescriptorsForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("catalog metric no-selection view renders choose-metric copy when helper is available", () => {
    const rawSettings = buildCatalogWidgetSettings("");
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({});

    const viewOptions = buildCatalogMetricNoSelectionViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-empty-action"), rawSettings),
        settings,
        helperStatus: { state: "available" },
        platform: "win32",
    });

    assert.equal(viewOptions.metricKey, "catalog.unselected");
    assert.equal(viewOptions.noticeText, CATALOG_CHOOSE_METRIC_NOTICE_TEXT);
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
    assert.deepEqual(metricReader.widgetDataCalls, []);
});

test("catalog metric no-selection view renders install-helper copy only for never-installed helper", () => {
    const rawSettings = buildCatalogWidgetSettings("");
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;

    const viewOptions = buildCatalogMetricNoSelectionViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-install-helper-action"), rawSettings),
        settings,
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
        platform: "win32",
    });

    assert.equal(viewOptions.noticeText, CATALOG_INSTALL_HELPER_NOTICE_TEXT);
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("catalog metric no-selection view keeps generic copy when helper is installed but stopped", () => {
    const rawSettings = buildCatalogWidgetSettings("");
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;

    const viewOptions = buildCatalogMetricNoSelectionViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-stopped-helper-action"), rawSettings),
        settings,
        helperStatus: { state: "unavailable", reason: "helperStopped" },
        platform: "win32",
    });

    assert.equal(viewOptions.noticeText, undefined);
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("catalog metric selected view uses stored detected label unit and unit maximum", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/power", {
        detectedLabel: "GPU Board Power",
        detectedUnit: MetricUnit.WATTS,
        detectedCategory: "gpu",
        detectedReadingKind: "power",
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
            maxValue: 450,
        },
    ]);
    assert.equal(viewOptions.widgetData.current, 150);
    assert.equal(viewOptions.widgetData.progress, 1 / 3);
    assert.equal(viewOptions.widgetData.label, "GPU Board Power");
    assert.equal(viewOptions.widgetData.unit, "W");
});

test("catalog metric selected view uses catalog metadata icons", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/cpu/0/temperature/package", {
        detectedLabel: "CPU Package",
        detectedUnit: MetricUnit.CELSIUS,
        detectedCategory: "cpu",
        detectedReadingKind: "temperature",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-cpu-icon-action"), rawSettings),
        settings,
        target: readCatalogTarget(settings),
        metrics: new CapturingMetricStoreReader({
            current: 72,
            sampleTimestampMilliseconds: wallClockNowMilliseconds(),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(viewOptions.centerIconFragment, getHardwareIconFragment("cpu"));
    assert.deepEqual(viewOptions.statusIcon, getMetricStatusIcon("temperature"));
    assert.doesNotMatch(viewOptions.centerIconFragment, /question/iu);
});

test("catalog metric selected circle value view compacts long labels", () => {
    const rawSettings = writeStoredWidgetSettingsPatch(
        buildCatalogWidgetSettings("source.sensor:/cpu/0/temperature/package", {
            detectedLabel: "CPU Package",
            detectedUnit: MetricUnit.CELSIUS,
            detectedCategory: "cpu",
            detectedReadingKind: "temperature",
        }),
        {
            appearance: {
                view: {
                    selectedView: "circle",
                    circleVariant: "full-ring",
                },
            },
        },
    );
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-compact-label-action"), rawSettings),
        settings,
        target: readCatalogTarget(settings),
        metrics: new CapturingMetricStoreReader({
            current: 72,
            sampleTimestampMilliseconds: wallClockNowMilliseconds(),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(viewOptions.widgetData.label, "CP");
});

test("catalog metric selected view uses custom label and custom maximum", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/power", {
        detectedLabel: "GPU Board Power",
        detectedUnit: MetricUnit.WATTS,
        detectedCategory: "gpu",
        detectedReadingKind: "power",
        customLabel: "Board",
        customMaximumValue: 600,
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 300,
        sampleTimestampMilliseconds: wallClockNowMilliseconds(),
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-custom-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });

    assert.deepEqual(metricReader.widgetDataCalls, [
        {
            metricKey: "source.sensor:/gpu/0/power",
            label: "Board",
            unit: "W",
            maxValue: 600,
        },
    ]);
    assert.equal(viewOptions.widgetData.progress, 0.5);
    assert.equal(viewOptions.widgetData.label, "Board");
});

test("catalog metric selected view leaves key copy generic when helper is available without data", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/temperature", {
        detectedLabel: "GPU Hot Spot",
        detectedUnit: MetricUnit.CELSIUS,
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
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
    assert.equal(viewOptions.noticeText, undefined);
});

test("catalog metric selected view renders install-helper notice when helper is not installed", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/gpu/0/temperature", {
        detectedLabel: "GPU Hot Spot",
        detectedUnit: MetricUnit.CELSIUS,
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        sampleTimestampMilliseconds: undefined,
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-selected-install-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "unavailable", reason: "helperNotInstalled" },
    });

    assert.equal(viewOptions.noticeText, CATALOG_INSTALL_HELPER_NOTICE_TEXT);
    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("catalog metric selected view formats large units only for fresh helper data", () => {
    const rawSettings = buildCatalogWidgetSettings("memory.total", {
        detectedLabel: "Total Memory",
        detectedUnit: MetricUnit.BYTES,
        detectedCategory: "memory",
        detectedReadingKind: "data",
    });
    const settings = resolveInitialActionSettings(rawSettings, "catalog").resolvedSettings;
    const target = readCatalogTarget(settings);
    const metricReader = new CapturingMetricStoreReader({
        current: 64 * 1024 ** 3,
        sampleTimestampMilliseconds: wallClockNowMilliseconds(),
    });
    const staleMetricReader = new CapturingMetricStoreReader({
        current: 64 * 1024 ** 3,
        sampleTimestampMilliseconds: undefined,
    });

    const viewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-bytes-action"), rawSettings),
        settings,
        target,
        metrics: metricReader,
        helperStatus: { state: "available" },
    });
    const staleViewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-stale-bytes-action"), rawSettings),
        settings,
        target,
        metrics: staleMetricReader,
        helperStatus: { state: "available" },
    });

    assert.equal(viewOptions.widgetData.current, 64 * 1024 ** 3);
    assert.equal(viewOptions.widgetData.displayValue, "64");
    assert.equal(viewOptions.widgetData.unit, "GB");
    assert.deepEqual(viewOptions.statusIcon, getMetricStatusIcon("data"));
    assert.equal(staleViewOptions.widgetData.displayValue, undefined);
    assert.equal(staleViewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("catalog metric selected view formats bytes per second and hertz values", () => {
    const networkSettings = buildCatalogWidgetSettings("network.rx", {
        detectedLabel: "Network Receive",
        detectedUnit: MetricUnit.BYTES_PER_SECOND,
        detectedCategory: "network",
        detectedReadingKind: "throughput",
    });
    const clockSettings = buildCatalogWidgetSettings("cpu.clock", {
        detectedLabel: "Core Clock",
        detectedUnit: MetricUnit.HERTZ,
        detectedCategory: "cpu",
        detectedReadingKind: "clock",
    });
    const networkResolvedSettings = resolveInitialActionSettings(networkSettings, "catalog").resolvedSettings;
    const clockResolvedSettings = resolveInitialActionSettings(clockSettings, "catalog").resolvedSettings;

    const networkViewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-network-action"), networkSettings),
        settings: networkResolvedSettings,
        target: readCatalogTarget(networkResolvedSettings),
        metrics: new CapturingMetricStoreReader({
            current: 125 * 1000 ** 2,
            sampleTimestampMilliseconds: wallClockNowMilliseconds(),
        }),
        helperStatus: { state: "available" },
    });
    const clockViewOptions = buildCatalogMetricSelectedViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("catalog-render-clock-action"), clockSettings),
        settings: clockResolvedSettings,
        target: readCatalogTarget(clockResolvedSettings),
        metrics: new CapturingMetricStoreReader({
            current: 3_500_000_000,
            sampleTimestampMilliseconds: wallClockNowMilliseconds(),
        }),
        helperStatus: { state: "available" },
    });

    assert.equal(networkViewOptions.widgetData.displayValue, "125");
    assert.equal(networkViewOptions.widgetData.unit, "MB/s");
    assert.equal(networkViewOptions.centerIconFragment, getHardwareIconFragment("network"));
    assert.deepEqual(networkViewOptions.statusIcon, getMetricStatusIcon("throughput"));
    assert.equal(clockViewOptions.widgetData.displayValue, "3.5");
    assert.equal(clockViewOptions.widgetData.unit, "GHz");
    assert.deepEqual(clockViewOptions.statusIcon, getMetricStatusIcon("clock"));
});

test("catalog metric selected view uses 100 as the percent maximum", () => {
    const rawSettings = buildCatalogWidgetSettings("source.sensor:/network/load", {
        detectedLabel: "Network Utilization",
        detectedUnit: MetricUnit.PERCENT,
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
        detectedLabel: "Fan",
        detectedUnit: MetricUnit.REVOLUTIONS_PER_MINUTE,
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

    constructor(
        private descriptorReadResult: MetricDescriptorSnapshot | Error = {
            descriptors: [],
            descriptorFingerprint: "empty-catalog",
        },
        private readonly sourceStatus: SourceClientStatus | undefined = undefined,
    ) {
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

    protected override readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        assert.equal(sourceId, WINDOWS_HELPER_SOURCE_ID);
        return this.sourceStatus;
    }

    protected override currentPlatform(): NodeJS.Platform {
        return "win32";
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

    getWidgetDataReadResult(
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
        readonly detectedLabel?: string;
        readonly detectedUnit?: MetricUnit;
        readonly detectedCategory?: CatalogMetricCategory;
        readonly detectedReadingKind?: CatalogMetricReadingKind;
        readonly customLabel?: string;
        readonly customMaximumValue?: number;
    } = {},
): unknown {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings;

    if (metricId.length === 0) {
        return quickStartSettings;
    }

    return writeStoredWidgetSettingsPatch(quickStartSettings, {
        catalog: {
            metricId,
            detectedLabel: options.detectedLabel ?? "GPU Hot Spot",
            detectedUnit: options.detectedUnit ?? MetricUnit.CELSIUS,
            detectedCategory: options.detectedCategory,
            detectedReadingKind: options.detectedReadingKind,
            customLabel: options.customLabel,
            customMaximumValue: options.customMaximumValue,
        },
    });
}

function readCatalogTarget(settings: ReturnType<typeof resolveInitialActionSettings>["resolvedSettings"]) {
    const target = requireResolvedSingleMetricWidget(settings).slot.metric.target;

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
        metricIdKind: MetricIdKind.SOURCE_NATIVE,
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


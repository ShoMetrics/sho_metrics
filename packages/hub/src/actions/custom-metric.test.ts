import assert from "node:assert/strict";
import test from "node:test";
import type { PropertyInspectorDidAppearEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { CustomMetric } from "./custom-metric";
import type { MetricCollectionBinding } from "./metric-action";
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
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/widget-settings-patch";

test("custom metric without selected metric does not register collection", () => {
    const action = new TestCustomMetric();
    const streamDeckAction = new FakeStreamDeckAction("custom-empty-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCatalogWidgetSettings("")));

        assert.equal(action.bindings.length, 0);
        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("custom metric with selected metric registers exactly one metric key", () => {
    const action = new TestCustomMetric();
    const streamDeckAction = new FakeStreamDeckAction("custom-selected-action");

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

test("custom metric publishes helper descriptors to runtime cache", async () => {
    const descriptor = buildMetricDescriptor("source.sensor:/gpu/0/temperature");
    const action = new TestCustomMetric({
        descriptors: [descriptor],
        descriptorFingerprint: "catalog-fingerprint",
    });
    const streamDeckAction = new FakeStreamDeckAction("custom-descriptor-action");

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

test("custom metric publishes failed descriptor status", async () => {
    const action = new TestCustomMetric(new Error("helper unavailable"));
    const streamDeckAction = new FakeStreamDeckAction("custom-descriptor-failed-action");

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

class TestCustomMetric extends CustomMetric {
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

function buildCatalogWidgetSettings(metricId: string): unknown {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings;

    if (metricId.length === 0) {
        return quickStartSettings;
    }

    return writeStoredWidgetSettingsPatch(quickStartSettings, {
        catalog: {
            metricId,
            fallbackLabel: "GPU Hot Spot",
            fallbackUnit: "C",
        },
    });
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

import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { CustomMetric } from "./custom-metric";
import type { MetricCollectionBinding } from "./metric-action";
import { listMetricReadPlanKeys } from "../runtime/source-routing/metric-read-plan";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
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

class TestCustomMetric extends CustomMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    metricsUpdateCallCount = 0;

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

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

import assert from "node:assert/strict";
import test from "node:test";
import type {
    DidReceiveSettingsEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import {
    buildCustomMetricViewOptions,
    CustomMetric,
} from "./custom-metric";
import type { MetricCollectionBinding } from "./metric-action";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import { listMetricReadPlanKeys, normalizeMetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import { CustomHttpDefinitionRegistry } from "../runtime/sources/custom-http/custom-http-definition-registry";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import { MetricUnit } from "../runtime/sources/metric-source";
import type { MetricValueDisplayHint } from "../runtime/sources/source-client";
import { CUSTOM_HTTP_SOURCE_ID } from "../runtime/sources/source-ids";
import type { WidgetData } from "../view-rendering/widget-data";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";

test("Custom Metric without configured HTTP does not register collection or runtime definition", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-empty-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));

        assert.equal(action.bindings.length, 0);
        assert.deepEqual(registry.list(), []);
        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric registers configured HTTP definition and routes through custom-http source", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-configured-action");
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, rawSettings));

        const identity = buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/data",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        assert.deepEqual(registry.read(identity.metricKey), {
            identity,
            request: {
                url: "https://api.example.com/data",
                userIntent: "show CPU",
                jqTransform: ".",
            },
        });
        assert.equal(action.bindings.length, 1);
        const readPlan = normalizeMetricReadPlan(action.bindings[0].refreshOptionsList[0].readPlan);
        assert.deepEqual(listMetricReadPlanKeys(readPlan), [identity.metricKey]);
        assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: CUSTOM_HTTP_SOURCE_ID }]);
        assert.equal(readPlan.metrics[0]?.sourceScopeId, identity.sourceScopeId);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric replaces runtime definition when settings change", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-replace-action");
    const firstSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/first",
        userIntent: "show CPU",
        jqTransform: ".cpu",
    });
    const secondSettings = buildCustomMetricWidgetSettings({
        url: "https://api2.example.com/second",
        userIntent: "show RAM",
        jqTransform: ".ram",
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, firstSettings));
        const firstIdentity = buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/first",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });

        action.onDidReceiveSettings(buildDidReceiveSettingsEvent(streamDeckAction, secondSettings));

        const secondIdentity = buildCustomHttpRuntimeIdentity({
            url: "https://api2.example.com/second",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        assert.equal(registry.read(firstIdentity.metricKey), undefined);
        assert.equal(registry.read(secondIdentity.metricKey)?.request.jqTransform, ".ram");
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric unregisters runtime definition on disappear", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-disappear-action");
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, rawSettings));
    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.deepEqual(registry.list(), []);
});

test("Custom Metric view renders Configure for unconfigured settings", () => {
    const rawSettings = buildCustomMetricWidgetSettings();
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-configure-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
    });

    assert.equal(viewOptions.metricKey, "custom-http.configure");
    assert.equal(viewOptions.noticeText, "Configure");
});

test("Custom Metric view renders pending copy before the first configured sample", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-pending-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({}),
    });

    assert.equal(viewOptions.widgetData.unavailableDisplayValue, "...");
});

test("Custom Metric view keeps N/A path after runtime failure", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-failed-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({
            unavailableMetric: true,
        }),
    });

    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("Custom Metric view uses source display hints for label, unit, and maximum", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({
        current: 42,
        sampleTimestampMilliseconds: 1234,
        displayHint: {
            label: "CPU",
            unit: MetricUnit.PERCENT,
            maximum: 84,
        },
    });

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-hint-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: metricReader,
    });

    assert.equal(viewOptions.widgetData.label, "CPU");
    assert.equal(viewOptions.widgetData.unit, "%");
    assert.equal(viewOptions.widgetData.current, 42);
    assert.equal(viewOptions.widgetData.progress, 0.5);
    assert.deepEqual(viewOptions.widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 84,
    });
});

test("Custom Metric view preserves custom unit text without catalog unit formatting", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show wind",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({
        current: 18,
        sampleTimestampMilliseconds: 1234,
        displayHint: {
            label: "Wind",
            unit: MetricUnit.UNSPECIFIED,
            customUnit: "km/h",
        },
    });

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-unit-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: metricReader,
    });

    assert.equal(viewOptions.widgetData.label, "Wind");
    assert.equal(viewOptions.widgetData.unit, "km/h");
    assert.equal(viewOptions.widgetData.displayValue, undefined);
});

class TestCustomMetric extends CustomMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    metricsUpdateCallCount = 0;

    constructor(definitionRegistry: CustomHttpDefinitionRegistry) {
        super({ definitionRegistry });
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = new FakeMetricCollectionBinding();
        this.bindings.push(binding);
        return binding;
    }

    protected override onMetricsUpdate(): void {
        this.metricsUpdateCallCount += 1;
    }

    protected override updateRuntimeCache(): Promise<void> {
        return Promise.resolve();
    }
}

class FakeMetricCollectionBinding implements MetricCollectionBinding {
    readonly refreshOptionsList: Parameters<MetricCollectionBinding["refresh"]>[0][] = [];
    disposed = false;

    refresh(options: Parameters<MetricCollectionBinding["refresh"]>[0]): void {
        this.refreshOptionsList.push(options);
    }

    dispose(): void {
        this.disposed = true;
    }
}

class CapturingMetricStoreReader implements MetricStoreReader {
    constructor(private readonly options: {
        readonly current?: number;
        readonly sampleTimestampMilliseconds?: number;
        readonly unavailableMetric?: boolean;
        readonly displayHint?: MetricValueDisplayHint;
    }) {}

    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData {
        return this.getWidgetDataWithAttribution(metricKey, label, unit, maxValue).widgetData;
    }

    getWidgetDataWithAttribution(
        metricKey: string,
        label: string,
        unit: string,
        maxValue = 100,
    ): MetricWidgetDataReadResult {
        const current = this.options.current ?? 0;
        const widgetData: WidgetData = {
            current,
            progress: Math.min(Math.max(current / maxValue, 0), 1),
            history: this.options.sampleTimestampMilliseconds === undefined ? [] : [current],
            label,
            unit,
            sampleTimestampMilliseconds: this.options.sampleTimestampMilliseconds,
        };

        return {
            widgetData,
            selectedSourceId: this.options.sampleTimestampMilliseconds === undefined
                ? undefined
                : "custom-http",
            ...(this.options.sampleTimestampMilliseconds === undefined
                ? {}
                : {
                    valueAttribution: {
                        metricId: metricKey,
                        valueFreshness: "fresh",
                        ...(this.options.displayHint === undefined ? {} : { displayHint: this.options.displayHint }),
                    },
                }),
            ...(this.options.unavailableMetric === true
                ? {
                    unavailableMetric: {
                        metricId: metricKey,
                        reason: "unknown",
                    },
                }
                : {}),
        };
    }

    getTextValue(): string | undefined {
        return undefined;
    }
}

class FakeStreamDeckAction {
    constructor(readonly id: string) {}

    readonly device = { id: "device-1" };

    isDial(): boolean {
        return false;
    }

    isKey(): boolean {
        return true;
    }

    setSettings(): Promise<void> {
        return Promise.resolve();
    }
}

function buildCustomMetricWidgetSettings(patch: {
    readonly url?: string;
    readonly userIntent?: string;
    readonly jqTransform?: string;
} = {}): unknown {
    const settings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;
    return writeStoredWidgetSettingsPatch(settings, {
        customMetric: patch,
    });
}

function readCustomMetricTarget(settings: ReturnType<typeof resolveInitialActionSettings>["resolvedSettings"]) {
    const widget = settings.widget;
    if (widget.widgetKind !== "singleMetric" || widget.slot.metric.target.domain !== "customMetric") {
        throw new Error("Expected Custom Metric settings.");
    }

    return widget.slot.metric.target;
}

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: {
            settings,
        },
    } as unknown as WillAppearEvent;
}

function buildDidReceiveSettingsEvent(action: FakeStreamDeckAction, settings: unknown): DidReceiveSettingsEvent {
    return {
        action,
        payload: {
            settings,
        },
    } as unknown as DidReceiveSettingsEvent;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

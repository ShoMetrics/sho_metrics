import assert from "node:assert/strict";
import test from "node:test";
import type {
    DidReceiveSettingsEvent,
    PropertyInspectorDidAppearEvent,
    SendToPluginEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction, type MetricCollectionBinding } from "./metric-action";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { metricStore } from "../runtime/metric-store";
import { buildMetricSnapshot, buildScalarMetricValue } from "../runtime/sources/metric-source";
import { buildMetricReadPlanKey } from "../runtime/sources/metric-read-plan";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredGlobalSettingsPatch } from "../settings/storage/global-settings-patch";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/widget-settings-patch";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    buildColorCompensationPreviewMessage,
    buildColorCompensationStartMessage,
} from "../color-compensation/messages";
import {
    clearColorCompensationPreview,
    resolveHardwareColorCompensationProfile,
} from "../color-compensation/runtime-store";

test("onWillAppear persists quick-start settings only when missing", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("quick-start-action");
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, undefined);

    try {
        action.onWillAppear(willAppearEvent);

        assert.equal(streamDeckAction.writtenSettingsList.length, 1);
        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 1);
        assert.equal(action.metricsUpdateSnapshots.length, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("onWillAppear keeps existing quick-start settings without rewriting them", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("existing-settings-action");
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings());

    try {
        action.onWillAppear(willAppearEvent);

        assert.deepEqual(streamDeckAction.writtenSettingsList, []);
        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 1);
        assert.equal(action.metricsUpdateSnapshots.length, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("unchanged polling plan keeps the existing subscription and forces an immediate update", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("same-plan-action");
    const initialSettings = buildNetworkWidgetSettings({
        appearance: {
            view: { selectedView: "circle" },
        },
    });
    const nextSettings = writeStoredWidgetSettingsPatch(initialSettings, {
        appearance: {
            view: { selectedView: "circle" },
        },
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, initialSettings));
        action.onDidReceiveSettings(buildDidReceiveSettingsEvent(streamDeckAction, nextSettings));

        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 1);
        assert.equal(action.bindings[0].refreshDisposeCallCount, 0);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("changed polling plan resubscribes and forces an immediate update", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("changed-plan-action");
    const initialSettings = buildNetworkWidgetSettings({
        appearance: {
            view: { selectedView: "circle" },
        },
    });
    const nextSettings = writeStoredWidgetSettingsPatch(initialSettings, {
        appearance: {
            view: { selectedView: "line" },
        },
        preferences: {
            pollingFrequencySeconds: 5,
        },
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, initialSettings));
        action.onDidReceiveSettings(buildDidReceiveSettingsEvent(streamDeckAction, nextSettings));

        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 2);
        assert.equal(action.bindings[0].refreshDisposeCallCount, 1);
        assert.equal(action.bindings[0].refreshOptionsList[1].pollingIntervalMilliseconds, 5000);
        assert.deepEqual(action.bindings[0].refreshOptionsList[0].readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(action.bindings[0].refreshOptionsList[1].readPlan.metricKeys, ["net.up"]);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("global settings changes re-resolve settings resubscribe and force an immediate update", () => {
    pluginGlobalSettingsStore.update(undefined);
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("global-settings-action");
    const initialSettings = buildNetworkWidgetSettings({
        appearance: {
            view: { selectedView: "circle" },
        },
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, initialSettings));
        pluginGlobalSettingsStore.update(writeStoredGlobalSettingsPatch(undefined, {
            globalOverrideEnabled: true,
            viewOverrideEnabled: true,
            view: { selectedView: "line" },
        }));

        assert.equal(action.bindings.length, 2);
        assert.equal(action.bindings[0].disposeCallCount, 1);
        assert.deepEqual(action.bindings[0].refreshOptionsList[0].readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(action.bindings[1].refreshOptionsList[0].readPlan.metricKeys, ["net.up"]);
        assert.deepEqual(action.metricsUpdateSnapshots.map(snapshot => snapshot.selectedView), ["circle", "line"]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        pluginGlobalSettingsStore.update(undefined);
    }
});

test("global settings changes resubscribe even when the polling plan is unchanged", () => {
    pluginGlobalSettingsStore.update(undefined);
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("global-same-plan-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings({
            appearance: {
                view: { selectedView: "circle" },
            },
        })));
        pluginGlobalSettingsStore.update(writeStoredGlobalSettingsPatch(undefined, {
            network: {
                maximumDownloadSpeedMegabitsPerSecond: 1000,
            },
        }));

        assert.equal(action.bindings.length, 2);
        assert.equal(action.bindings[0].disposeCallCount, 1);
        assert.deepEqual(action.bindings[0].refreshOptionsList[0].readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(action.bindings[1].refreshOptionsList[0].readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(action.metricsUpdateSnapshots.map(snapshot => snapshot.selectedView), ["circle", "circle"]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        pluginGlobalSettingsStore.update(undefined);
    }
});

test("onWillDisappear cleans subscription state and ignores later render ticks", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("disappear-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
    action.bindings[0].refreshOptionsList[0].onTick();

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    action.bindings[0].refreshOptionsList[0].onTick();

    assert.equal(action.bindings[0].disposeCallCount, 1);
    assert.equal(action.metricsUpdateSnapshots.length, 2);
});

test("metric collection uses action-owned render cadence", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("background-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

    assert.equal(action.bindings[0].refreshOptionsList.length, 1);
    assert.deepEqual(action.bindings[0].refreshOptionsList[0].readPlan.metricKeys, ["net.down"]);
    assert.equal(action.metricsUpdateSnapshots.length, 1);

    action.bindings[0].refreshOptionsList[0].onTick();

    assert.equal(action.metricsUpdateSnapshots.length, 2);

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.equal(action.bindings[0].disposeCallCount, 1);
});

test("metric collection reads source-candidate samples through synchronous fallback", () => {
    metricStore.clear();
    const action = new TestMetricReaderAction();
    const streamDeckAction = new FakeStreamDeckAction("background-fallback-action");

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "net.down": buildScalarMetricValue(123),
        },
    }));

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.widgetCurrents, [123]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        metricStore.clear();
    }
});

test("global settings changes recreate background collection bindings", () => {
    pluginGlobalSettingsStore.update(undefined);
    const firstBinding = new FakeMetricCollectionBinding();
    const secondBinding = new FakeMetricCollectionBinding();
    const action = new TestMetricAction(createQueuedBindingFactory([
        firstBinding,
        secondBinding,
    ]));
    const streamDeckAction = new FakeStreamDeckAction("background-global-settings-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        pluginGlobalSettingsStore.update(writeStoredGlobalSettingsPatch(undefined, {
            network: {
                maximumDownloadSpeedMegabitsPerSecond: 1000,
            },
        }));

        assert.equal(firstBinding.refreshOptionsList.length, 1);
        assert.equal(firstBinding.disposeCallCount, 1);
        assert.equal(secondBinding.refreshOptionsList.length, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        pluginGlobalSettingsStore.update(undefined);
    }
});

test("color compensation messages update delegated preview state and disappear clears it", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("color-compensation-action");
    const previewProfile = {
        brightnessAdjustment: 2,
        shadowAdjustment: -1,
        gammaAdjustment: 3,
        saturationAdjustment: 4,
    };

    try {
        clearColorCompensationPreview(streamDeckAction.id);
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        const initialProfile = resolveHardwareColorCompensationProfile({
            actionId: streamDeckAction.id,
            streamDeckDeviceId: undefined,
            surfaceId: undefined,
        });

        action.onSendToPlugin(buildSendToPluginEvent(
            streamDeckAction,
            buildColorCompensationStartMessage("session-1"),
        ));
        action.onSendToPlugin(buildSendToPluginEvent(
            streamDeckAction,
            buildColorCompensationPreviewMessage({
                sessionId: "session-1",
                kind: "widget-after",
                profile: previewProfile,
            }),
        ));

        assert.equal(action.metricsUpdateSnapshots.length, 2);
        assert.deepEqual(resolveHardwareColorCompensationProfile({
            actionId: streamDeckAction.id,
            streamDeckDeviceId: undefined,
            surfaceId: undefined,
        }), previewProfile);

        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

        assert.deepEqual(resolveHardwareColorCompensationProfile({
            actionId: streamDeckAction.id,
            streamDeckDeviceId: undefined,
            surfaceId: undefined,
        }), initialProfile);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        clearColorCompensationPreview(streamDeckAction.id);
    }
});

test("runtime cache publishes to Property Inspector without writing settings", async () => {
    const setSettingsCalls: unknown[] = [];
    const streamDeckAction = {
        id: "action-1",
        setSettings: (settings: unknown) => {
            setSettingsCalls.push(settings);
            return Promise.resolve();
        },
    };
    const action = new TestMetricAction();
    const circleViewNetworkSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                view: { selectedView: "circle" },
            },
        },
    );
    const lineViewNetworkSettings = writeStoredWidgetSettingsPatch(circleViewNetworkSettings, {
        appearance: {
            view: { selectedView: "line" },
        },
    });
    const willAppearEvent = {
        action: streamDeckAction,
        payload: {
            settings: circleViewNetworkSettings,
        },
    } as unknown as WillAppearEvent;

    try {
        action.onWillAppear(willAppearEvent);
        action.onDidReceiveSettings({
            action: streamDeckAction,
            payload: {
                settings: lineViewNetworkSettings,
            },
        } as unknown as DidReceiveSettingsEvent);

        await action.publishRuntimeCacheForTest(willAppearEvent);

        assert.deepEqual(setSettingsCalls, []);
        assert.equal(action.resolveNetworkDownloadMaximumForTest(willAppearEvent), 123);
        assert.deepEqual(action.runtimeCachePatchList, [
            {
                runtimeMaximumDownloadSpeedMbps: 123,
            },
        ]);
    } finally {
        action.onWillDisappear({
            action: streamDeckAction,
        } as unknown as WillDisappearEvent);
    }
});

test("unchanged runtime cache patch does not publish to Property Inspector", async () => {
    const streamDeckAction = new FakeStreamDeckAction("unchanged-runtime-cache-action");
    const action = new TestMetricAction();
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings());

    try {
        action.onWillAppear(willAppearEvent);

        await action.publishRuntimeCacheForTest(willAppearEvent);
        await action.publishRuntimeCacheForTest(willAppearEvent);

        assert.deepEqual(streamDeckAction.writtenSettingsList, []);
        assert.deepEqual(action.runtimeCachePatchList, [
            {
                runtimeMaximumDownloadSpeedMbps: 123,
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

class TestMetricAction extends MetricAction {
    protected readonly actionKind = "network";
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    readonly metricsUpdateSnapshots: Array<{
        readonly selectedView: string;
        readonly pollingFrequencySeconds: number;
    }> = [];

    constructor(private readonly bindingFactory: () => FakeMetricCollectionBinding = () => new FakeMetricCollectionBinding()) {
        super();
    }

    protected getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);

        return settings.widget.slot.appearance.view.selectedView === "line"
            ? ["net.up"]
            : ["net.down"];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);

        this.metricsUpdateSnapshots.push({
            selectedView: settings.widget.slot.appearance.view.selectedView,
            pollingFrequencySeconds: settings.preferences.pollingFrequencySeconds,
        });
    }

    publishRuntimeCacheForTest(event: WillAppearEvent): Promise<void> {
        return this.updateRuntimeCache(event, {
            runtimeMaximumDownloadSpeedMbps: 123,
        });
    }

    resolveNetworkDownloadMaximumForTest(event: WillAppearEvent): number | undefined {
        const networkTarget = readResolvedMetricTarget(this.resolveSettings(event), "network");

        return networkTarget.reading.display.maximumDownloadSpeedMegabitsPerSecond;
    }

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        void event;
        this.runtimeCachePatchList.push(patch);
        return Promise.resolve();
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = this.bindingFactory();
        this.bindings.push(binding);
        return binding;
    }
}

class TestMetricReaderAction extends TestMetricAction {
    readonly widgetCurrents: number[] = [];

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        this.widgetCurrents.push(
            this.getMetricReader(event)
                .getWidgetData("net.down", "Download", "B")
                .current,
        );
    }
}

class FakeMetricCollectionBinding implements MetricCollectionBinding {
    readonly refreshOptionsList: Parameters<MetricCollectionBinding["refresh"]>[0][] = [];
    disposeCallCount = 0;
    refreshDisposeCallCount = 0;
    private readPlanSignature: string | null = null;
    private pollingIntervalMilliseconds: number | null = null;
    private subscriberId: string | null = null;

    refresh(options: Parameters<MetricCollectionBinding["refresh"]>[0]): void {
        const nextReadPlanSignature = buildMetricReadPlanKey(options.readPlan);

        if (
            this.readPlanSignature === nextReadPlanSignature
            && this.pollingIntervalMilliseconds === options.pollingIntervalMilliseconds
            && this.subscriberId === options.subscriberId
        ) {
            return;
        }

        if (this.readPlanSignature !== null) {
            this.refreshDisposeCallCount += 1;
        }

        this.refreshOptionsList.push(options);
        this.readPlanSignature = nextReadPlanSignature;
        this.pollingIntervalMilliseconds = options.pollingIntervalMilliseconds;
        this.subscriberId = options.subscriberId;
    }

    dispose(): void {
        this.disposeCallCount += 1;
        this.readPlanSignature = null;
        this.pollingIntervalMilliseconds = null;
        this.subscriberId = null;
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

function buildNetworkWidgetSettings(
    patch: Parameters<typeof writeStoredWidgetSettingsPatch>[1] = {},
): unknown {
    return writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        patch,
    );
}

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildDidReceiveSettingsEvent(action: FakeStreamDeckAction, settings: unknown): DidReceiveSettingsEvent {
    return {
        action,
        payload: { settings },
    } as unknown as DidReceiveSettingsEvent;
}

function buildSendToPluginEvent(
    action: FakeStreamDeckAction,
    payload: unknown,
): SendToPluginEvent<never, Record<string, never>> {
    return {
        action,
        payload,
    } as unknown as SendToPluginEvent<never, Record<string, never>>;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

function createQueuedBindingFactory(
    bindings: FakeMetricCollectionBinding[],
): () => FakeMetricCollectionBinding {
    return () => {
        const binding = bindings.shift();

        if (!binding) {
            throw new Error("No fake background binding queued.");
        }

        return binding;
    };
}

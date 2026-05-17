import assert from "node:assert/strict";
import test from "node:test";
import type {
    DidReceiveSettingsEvent,
    PropertyInspectorDidAppearEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";
import { MetricAction } from "./metric-action";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { buildMetricSnapshot } from "../runtime/sources/metric-source";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredGlobalSettingsPatch } from "../settings/storage/global-settings-patch";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/widget-settings-patch";

type SchedulerSubscribe = typeof scheduler.subscribe;
type SchedulerSubscriber = Parameters<SchedulerSubscribe>[0];
type SchedulerSubscribeOptions = Parameters<SchedulerSubscribe>[1];

interface SchedulerSubscriptionRecord {
    readonly callback: SchedulerSubscriber;
    readonly options: SchedulerSubscribeOptions;
    cleanupCallCount: number;
}

interface SchedulerSubscribeRecorder {
    readonly records: SchedulerSubscriptionRecord[];
    restore(): void;
}

test("onWillAppear persists quick-start settings only when missing", () => {
    const schedulerRecorder = installSchedulerSubscribeRecorder();
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("quick-start-action");
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, undefined);

    try {
        action.onWillAppear(willAppearEvent);

        assert.equal(streamDeckAction.writtenSettingsList.length, 1);
        assert.equal(schedulerRecorder.records.length, 1);
        assert.equal(action.metricsUpdateSnapshots.length, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.restore();
    }
});

test("onWillAppear keeps existing quick-start settings without rewriting them", () => {
    const schedulerRecorder = installSchedulerSubscribeRecorder();
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("existing-settings-action");
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings());

    try {
        action.onWillAppear(willAppearEvent);

        assert.deepEqual(streamDeckAction.writtenSettingsList, []);
        assert.equal(schedulerRecorder.records.length, 1);
        assert.equal(action.metricsUpdateSnapshots.length, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.restore();
    }
});

test("unchanged polling plan keeps the existing subscription and forces an immediate update", () => {
    const schedulerRecorder = installSchedulerSubscribeRecorder();
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

        assert.equal(schedulerRecorder.records.length, 1);
        assert.equal(schedulerRecorder.records[0].cleanupCallCount, 0);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.restore();
    }
});

test("changed polling plan resubscribes and forces an immediate update", () => {
    const schedulerRecorder = installSchedulerSubscribeRecorder();
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

        assert.equal(schedulerRecorder.records.length, 2);
        assert.equal(schedulerRecorder.records[0].cleanupCallCount, 1);
        assert.equal(schedulerRecorder.records[1].options.pollingIntervalMilliseconds, 5000);
        assert.deepEqual(schedulerRecorder.records[0].options.readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(schedulerRecorder.records[1].options.readPlan.metricKeys, ["net.up"]);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.restore();
    }
});

test("global settings changes re-resolve settings resubscribe and force an immediate update", () => {
    pluginGlobalSettingsStore.update(undefined);
    const schedulerRecorder = installSchedulerSubscribeRecorder();
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

        assert.equal(schedulerRecorder.records.length, 2);
        assert.equal(schedulerRecorder.records[0].cleanupCallCount, 1);
        assert.deepEqual(schedulerRecorder.records[0].options.readPlan.metricKeys, ["net.down"]);
        assert.deepEqual(schedulerRecorder.records[1].options.readPlan.metricKeys, ["net.up"]);
        assert.deepEqual(action.metricsUpdateSnapshots.map(snapshot => snapshot.selectedView), ["circle", "line"]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.restore();
        pluginGlobalSettingsStore.update(undefined);
    }
});

test("onWillDisappear cleans subscription state and ignores later scheduler ticks", () => {
    const schedulerRecorder = installSchedulerSubscribeRecorder();
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("disappear-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        schedulerRecorder.records[0].callback(buildMetricSnapshot({
            sourceId: "node-system",
            timestampMilliseconds: 1000,
            metrics: {},
        }));

        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        schedulerRecorder.records[0].callback(buildMetricSnapshot({
            sourceId: "node-system",
            timestampMilliseconds: 2000,
            metrics: {},
        }));

        assert.equal(schedulerRecorder.records[0].cleanupCallCount, 1);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        schedulerRecorder.restore();
    }
});

test("runtime cache publishes to Property Inspector without writing settings", async () => {
    const originalSubscribe = scheduler.subscribe;
    scheduler.subscribe = (() => () => undefined) as typeof scheduler.subscribe;

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
        assert.deepEqual(action.runtimeCachePatchList, [
            {
                runtimeMaximumDownloadSpeedMbps: 123,
            },
        ]);
    } finally {
        action.onWillDisappear({
            action: streamDeckAction,
        } as unknown as WillDisappearEvent);
        scheduler.subscribe = originalSubscribe;
    }
});

class TestMetricAction extends MetricAction {
    protected readonly actionKind = "network";
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    readonly metricsUpdateSnapshots: Array<{
        readonly selectedView: string;
        readonly pollingFrequencySeconds: number;
    }> = [];

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

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        void event;
        this.runtimeCachePatchList.push(patch);
        return Promise.resolve();
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

function installSchedulerSubscribeRecorder(): SchedulerSubscribeRecorder {
    const originalSubscribe = scheduler.subscribe;
    const records: SchedulerSubscriptionRecord[] = [];

    scheduler.subscribe = ((callback: SchedulerSubscriber, options: SchedulerSubscribeOptions) => {
        const record: SchedulerSubscriptionRecord = {
            callback,
            options,
            cleanupCallCount: 0,
        };
        records.push(record);

        return () => {
            record.cleanupCallCount += 1;
        };
    }) as SchedulerSubscribe;

    return {
        records,
        restore: () => {
            scheduler.subscribe = originalSubscribe;
        },
    };
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

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

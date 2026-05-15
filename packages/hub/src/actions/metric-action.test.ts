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
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/widget-settings-patch";

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
    const circularNetworkSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            appearance: {
                graph: { viewLayout: "circular" },
            },
        },
    );
    const sparklineNetworkSettings = writeStoredWidgetSettingsPatch(circularNetworkSettings, {
        appearance: {
            graph: { viewLayout: "sparkline" },
        },
    });
    const willAppearEvent = {
        action: streamDeckAction,
        payload: {
            settings: circularNetworkSettings,
        },
    } as unknown as WillAppearEvent;

    try {
        action.onWillAppear(willAppearEvent);
        action.onDidReceiveSettings({
            action: streamDeckAction,
            payload: {
                settings: sparklineNetworkSettings,
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

    protected onMetricsUpdate(event: WillAppearEvent): void {
        this.resolveSettings(event);
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

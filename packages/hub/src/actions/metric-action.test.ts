import assert from "node:assert/strict";
import test from "node:test";
import type { DidReceiveSettingsEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { scheduler } from "../runtime/scheduler";
import { updateWidgetRuntimeCache } from "../settings/updates";
import type { WidgetStoredSettings } from "../settings/widget-settings";
import { MetricAction } from "./metric-action";

test("runtime cache writes merge into the latest received settings", async () => {
    const originalSubscribe = scheduler.subscribe;
    scheduler.subscribe = (() => () => undefined) as typeof scheduler.subscribe;

    const setSettingsCalls: WidgetStoredSettings[] = [];
    const streamDeckAction = {
        id: "action-1",
        setSettings: (settings: WidgetStoredSettings) => {
            setSettingsCalls.push(settings);
            return Promise.resolve();
        },
    };
    const action = new TestMetricAction();
    const willAppearEvent = {
        action: streamDeckAction,
        payload: {
            settings: {
                appearanceOverrides: {
                    graphicType: "circular",
                },
            },
        },
    } as unknown as WillAppearEvent;

    try {
        action.onWillAppear(willAppearEvent);
        action.onDidReceiveSettings({
            action: streamDeckAction,
            payload: {
                settings: {
                    appearanceOverrides: {
                        graphicType: "dashed-line",
                    },
                },
            },
        } as unknown as DidReceiveSettingsEvent);

        await action.publishRuntimeCacheForTest(willAppearEvent);

        assert.deepEqual(setSettingsCalls.at(-1), {
            appearanceOverrides: {
                graphicType: "dashed-line",
            },
            runtimeCache: {
                learnedMaximumDownloadSpeedMbps: 123,
            },
        });
    } finally {
        action.onWillDisappear({
            action: streamDeckAction,
        } as unknown as WillDisappearEvent);
        scheduler.subscribe = originalSubscribe;
    }
});

class TestMetricAction extends MetricAction {
    protected readonly actionKind = "net-speed";

    protected onMetricsUpdate(event: WillAppearEvent): void {
        this.resolveSettings(event);
    }

    publishRuntimeCacheForTest(event: WillAppearEvent): Promise<void> {
        return this.writeStoredSettings(event, updateWidgetRuntimeCache(this.readStoredSettings(event), {
            learnedMaximumDownloadSpeedMbps: 123,
        }));
    }
}

import assert from "node:assert/strict";
import { test } from "vitest";
import type {
    DialDownEvent,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    PropertyInspectorDidAppearEvent,
    SendToPluginEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction, type MetricCollectionBinding } from "./metric-action";
import type { SingleMetricViewOptions } from "../view-updates/runner";
import type {
    DisplayedMetricNoDataObservation,
    DisplayedMetricNoDataObserver,
} from "./shared/displayed-metric-no-data-observer";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import type { WidgetData } from "../view-rendering/widget-data";
import { metricStore } from "../runtime/metric-store";
import { buildMetricSnapshot, buildScalarMetricValue } from "../runtime/sources/metric-source";
import { buildMetricReadPlanKey, listMetricReadPlanKeys, type MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../runtime/sources/source-ids";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { requireResolvedSingleMetricWidget } from "../settings/resolved-settings";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredGlobalSettingsPatch } from "../settings/storage/global-settings-patch";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    buildColorCompensationPreviewMessage,
    buildColorCompensationStartMessage,
} from "../color-compensation/messages";
import {
    clearColorCompensationPreview,
    resolveHardwareColorCompensationProfile,
} from "../color-compensation/runtime-store";

const TEST_CURRENT_TIMESTAMP_MILLISECONDS = 10_000;

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
        assert.equal(action.bindings[0].refreshOptionsList[1].maximumSampleAgeMilliseconds, 10000);
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan), ["net.down"]);
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[1].readPlan), ["net.up"]);
        assert.equal(action.metricsUpdateSnapshots.length, 2);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("empty metric keys dispose collection without weakening read-plan invariants", () => {
    const action = new TestStaticMetricKeysAction(["net.down"]);
    const streamDeckAction = new FakeStreamDeckAction("empty-plan-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        action.setMetricKeys([]);
        action.onDidReceiveSettings(buildDidReceiveSettingsEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.equal(action.bindings.length, 1);
        assert.equal(action.bindings[0].disposeCallCount, 1);
        assert.equal(action.bindings[0].refreshOptionsList.length, 1);
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan), ["net.down"]);
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
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan), ["net.down"]);
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[1].refreshOptionsList[0].readPlan), ["net.up"]);
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
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan), ["net.down"]);
        assert.deepEqual(listMetricReadPlanKeys(action.bindings[1].refreshOptionsList[0].readPlan), ["net.down"]);
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

test("metric collection uses action-owned render timer", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("background-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

    assert.equal(action.bindings[0].refreshOptionsList.length, 1);
    assert.deepEqual(listMetricReadPlanKeys(action.bindings[0].refreshOptionsList[0].readPlan), ["net.down"]);
    assert.equal(action.bindings[0].refreshOptionsList[0].maximumSampleAgeMilliseconds, 6000);
    assert.equal(action.metricsUpdateSnapshots.length, 1);

    action.bindings[0].refreshOptionsList[0].onTick();

    assert.equal(action.metricsUpdateSnapshots.length, 2);

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.equal(action.bindings[0].disposeCallCount, 1);
});

test("key down requests subscriber refresh and shows refresh indicator while pending", async () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("manual-key-action");
    const willAppearEvent = buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings());
    const request = createDeferredPromise();
    action.queueSubscriberRefreshRequestForTest(request.promise);

    try {
        action.onWillAppear(willAppearEvent);

        assert.equal(action.readManualRefreshIndicatorForTest(willAppearEvent), undefined);
        action.onKeyDown(buildKeyDownEvent(streamDeckAction));

        assert.deepEqual(action.subscriberRefreshActionIds, ["manual-key-action"]);
        assert.equal(action.isManualRefreshPendingForTest(streamDeckAction.id), true);
        assert.equal(action.readManualRefreshIndicatorForTest(willAppearEvent), "visible");

        request.resolve();
        await request.promise;
        await Promise.resolve();

        assert.equal(action.isManualRefreshPendingForTest(streamDeckAction.id), false);
        assert.equal(action.readManualRefreshIndicatorForTest(willAppearEvent), undefined);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("dial down requests subscriber refresh", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("manual-dial-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        action.onDialDown(buildDialDownEvent(streamDeckAction));

        assert.deepEqual(action.subscriberRefreshActionIds, ["manual-dial-action"]);
        assert.equal(action.isManualRefreshPendingForTest(streamDeckAction.id), true);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("repeated manual refresh interactions do not start duplicate action requests while pending", () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("manual-repeat-action");
    action.queueSubscriberRefreshRequestForTest(createDeferredPromise().promise);

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        action.onKeyDown(buildKeyDownEvent(streamDeckAction));
        action.onKeyDown(buildKeyDownEvent(streamDeckAction));
        action.onDialDown(buildDialDownEvent(streamDeckAction));

        assert.deepEqual(action.subscriberRefreshActionIds, ["manual-repeat-action"]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("manual refresh state clears on disappear", async () => {
    const action = new TestMetricAction();
    const streamDeckAction = new FakeStreamDeckAction("manual-disappear-action");
    const request = createDeferredPromise();
    action.queueSubscriberRefreshRequestForTest(request.promise);

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
    action.onKeyDown(buildKeyDownEvent(streamDeckAction));

    assert.equal(action.isManualRefreshPendingForTest(streamDeckAction.id), true);
    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    assert.equal(action.isManualRefreshPendingForTest(streamDeckAction.id), false);

    request.resolve();
    await request.promise;
    await Promise.resolve();
    assert.equal(action.metricsUpdateSnapshots.length, 2);
});

test("metric collection subscriptions preserve each metric route's source candidates", () => {
    const action = new TestCustomReadPlanAction({
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                failureMode: "empty",
            },
            {
                sourceScopeId: "local",
                metricKey: "gpu.temp",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
        ],
    });
    const streamDeckAction = new FakeStreamDeckAction("per-route-subscription-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.bindings[0].refreshOptionsList[0].metricSubscriptions, [
            {
                subscriberId: "per-route-subscription-action",
                metricKey: "cpu.usage_percent",
                sourceScopeId: "local",
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                failureMode: "empty",
                intervalMilliseconds: 1000,
            },
            {
                subscriberId: "per-route-subscription-action",
                metricKey: "gpu.temp",
                sourceScopeId: "local",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
                intervalMilliseconds: 1000,
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("metric collection reads source-candidate values through synchronous fallback", () => {
    metricStore.clear();
    const action = new TestMetricReaderAction();
    const streamDeckAction = new FakeStreamDeckAction("background-fallback-action");

    metricStore.ingest("node-system", buildMetricSnapshot({
        timestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
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

test("metric action publishes displayed metric read trace from the fallback reader", () => {
    metricStore.clear();
    const action = new TestDisplayedReadTraceAction();
    const streamDeckAction = new FakeStreamDeckAction("displayed-read-trace-action");

    metricStore.ingest(NODE_SYSTEM_SOURCE_ID, buildMetricSnapshot({
        timestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
        metrics: {
            "net.down": buildScalarMetricValue(123),
        },
    }));

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                displayedMetricReadTrace: {
                    metricKey: "net.down",
                    routing: {
                        preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                        selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                    },
                    outcome: {
                        kind: "value",
                        valueTimestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
                        freshness: "fresh",
                    },
                },
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        metricStore.clear();
    }
});

test("metric action publishes displayed metric value metadata", () => {
    metricStore.clear();
    const action = new TestDisplayedReadTraceAction();
    const streamDeckAction = new FakeStreamDeckAction("displayed-value-metadata-action");

    metricStore.ingest(NODE_SYSTEM_SOURCE_ID, buildMetricSnapshot({
        timestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
        metrics: {
            "net.down": buildScalarMetricValue(123),
        },
    }), {
        valueMetadata: [{
            metricId: "net.down",
            rawSensorIdentity: {
                sourceSensorId: "source.sensor:/net/down",
                hardwareId: "adapter-1",
                hardwareName: "Ethernet",
                hardwareType: "Network",
                sensorName: "Download",
                sourceSensorType: "Throughput",
            },
            valueFreshness: "retained",
            retainedAgeMilliseconds: 1500,
        }],
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                displayedMetricReadTrace: {
                    metricKey: "net.down",
                    routing: {
                        preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                        selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                    },
                    outcome: {
                        kind: "value",
                        valueTimestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
                        freshness: "retained",
                        retainedAgeMilliseconds: 1500,
                        rawSensorIdentity: {
                            sourceSensorId: "source.sensor:/net/down",
                            hardwareId: "adapter-1",
                            sensorName: "Download",
                            hardwareName: "Ethernet",
                        },
                    },
                },
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        metricStore.clear();
    }
});

test("metric action reports no selected source when displayed metric has no fresh value", () => {
    metricStore.clear();
    const action = new TestDisplayedReadTraceAction();
    const streamDeckAction = new FakeStreamDeckAction("displayed-no-source-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                displayedMetricReadTrace: {
                    metricKey: "net.down",
                    routing: {
                        preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                        selectedSourceId: undefined,
                    },
                    outcome: undefined,
                },
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        metricStore.clear();
    }
});

test("metric action publishes unavailable metric read trace when no fresh value exists", () => {
    metricStore.clear();
    const action = new TestDisplayedReadTraceAction();
    const streamDeckAction = new FakeStreamDeckAction("displayed-unavailable-trace-action");

    metricStore.ingest(NODE_SYSTEM_SOURCE_ID, buildMetricSnapshot({
        timestampMilliseconds: TEST_CURRENT_TIMESTAMP_MILLISECONDS,
        metrics: {},
    }), {
        unavailableMetrics: [{
            metricId: "net.down",
            reason: "invalidValue",
            rawSensorIdentity: {
                sourceSensorId: "source.sensor:/net/down",
                hardwareId: "adapter-1",
                hardwareName: "Ethernet",
                hardwareType: "Network",
                sensorName: "Download",
                sourceSensorType: "Throughput",
            },
        }],
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(action.runtimeCachePatchList, [
            {
                displayedMetricReadTrace: {
                    metricKey: "net.down",
                    routing: {
                        preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                        selectedSourceId: undefined,
                    },
                    outcome: {
                        kind: "unavailable",
                        reason: "invalidValue",
                        lastValueTimestampMilliseconds: undefined,
                        rawSensorIdentity: {
                            sourceSensorId: "source.sensor:/net/down",
                            hardwareId: "adapter-1",
                            sensorName: "Download",
                            hardwareName: "Ethernet",
                        },
                    },
                },
            },
        ]);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        metricStore.clear();
    }
});

test("metric action clears no-data observer when no displayed metric is available", () => {
    const noDataObserver = new RecordingDisplayedMetricNoDataObserver();
    const action = new TestMetricAction(undefined, noDataObserver);
    const streamDeckAction = new FakeStreamDeckAction("no-displayed-metric-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(noDataObserver.clearedActionIds, ["no-displayed-metric-action"]);
        assert.deepEqual(noDataObserver.observations, []);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("metric action clears no-data observer when displayed metric is not in the read plan", () => {
    const noDataObserver = new RecordingDisplayedMetricNoDataObserver();
    const action = new TestMissingDisplayedMetricAction(noDataObserver);
    const streamDeckAction = new FakeStreamDeckAction("missing-displayed-metric-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));

        assert.deepEqual(noDataObserver.clearedActionIds, ["missing-displayed-metric-action"]);
        assert.deepEqual(noDataObserver.observations, []);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("metric action clears no-data observer on disappear", () => {
    const noDataObserver = new RecordingDisplayedMetricNoDataObserver();
    const action = new TestDisplayedReadTraceAction(undefined, noDataObserver);
    const streamDeckAction = new FakeStreamDeckAction("clear-no-data-on-disappear-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildNetworkWidgetSettings()));
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

        assert.deepEqual(noDataObserver.clearedActionIds, ["clear-no-data-on-disappear-action"]);
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
    readonly subscriberRefreshActionIds: string[] = [];
    readonly metricsUpdateSnapshots: Array<{
        readonly selectedView: string;
        readonly pollingFrequencySeconds: number;
    }> = [];

    private readonly bindingFactory: () => FakeMetricCollectionBinding;
    private readonly subscriberRefreshRequests: Promise<void>[] = [];

    constructor(
        bindingFactory: (() => FakeMetricCollectionBinding) | undefined = undefined,
        displayedMetricNoDataObserver?: DisplayedMetricNoDataObserver,
    ) {
        super({ displayedMetricNoDataObserver });
        this.bindingFactory = bindingFactory ?? (() => new FakeMetricCollectionBinding());
    }

    protected getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);

        return requireResolvedSingleMetricWidget(settings).slot.appearance.view.selectedView === "line"
            ? ["net.up"]
            : ["net.down"];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);

        this.metricsUpdateSnapshots.push({
            selectedView: requireResolvedSingleMetricWidget(settings).slot.appearance.view.selectedView,
            pollingFrequencySeconds: settings.preferences.pollingFrequencySeconds,
        });
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        void event;
        return undefined;
    }

    publishRuntimeCacheForTest(event: WillAppearEvent): Promise<void> {
        return this.updateRuntimeCache(event, {
            runtimeMaximumDownloadSpeedMbps: 123,
        });
    }

    resolveNetworkDownloadMaximumForTest(event: WillAppearEvent): number | undefined {
        const networkTarget = readResolvedMetricTarget(this.resolveSettings(event), "network");
        if (networkTarget.reading.kind !== "traffic") {
            return undefined;
        }

        return networkTarget.reading.display.maximumDownloadSpeedMegabitsPerSecond;
    }

    queueSubscriberRefreshRequestForTest(request: Promise<void>): void {
        this.subscriberRefreshRequests.push(request);
    }

    isManualRefreshPendingForTest(actionId: string): boolean {
        return this.isManualRefreshPending(actionId);
    }

    readManualRefreshIndicatorForTest(event: WillAppearEvent): "visible" | undefined {
        return this.withManualRefreshIndicator(event, this.buildManualRefreshTestViewOptions(event)).refreshIndicator;
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

    protected override currentTimestampMilliseconds(): number {
        return TEST_CURRENT_TIMESTAMP_MILLISECONDS;
    }

    protected override requestSubscriberRefresh(actionId: string): Promise<void> {
        this.subscriberRefreshActionIds.push(actionId);
        return this.subscriberRefreshRequests.shift() ?? Promise.resolve();
    }

    private buildManualRefreshTestViewOptions(event: WillAppearEvent): SingleMetricViewOptions {
        const settings = this.resolveSettings(event);

        return {
            event,
            metricKey: "net.down",
            metricRenderKind: "singleMetric",
            centerIconFragment: "",
            statusIcon: {
                fragment: "",
                viewBox: { x: 0, y: 0, width: 1, height: 1 },
            },
            widgetData: buildTestWidgetData(),
            resolvedSettings: requireResolvedSingleMetricWidget(settings).slot.appearance,
        };
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

class TestDisplayedReadTraceAction extends TestMetricAction {
    constructor(
        bindingFactory: (() => FakeMetricCollectionBinding) | undefined = undefined,
        displayedMetricNoDataObserver?: DisplayedMetricNoDataObserver,
    ) {
        super(bindingFactory, displayedMetricNoDataObserver);
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string {
        void event;
        return "net.down";
    }
}

class TestMissingDisplayedMetricAction extends TestMetricAction {
    constructor(displayedMetricNoDataObserver: DisplayedMetricNoDataObserver) {
        super(undefined, displayedMetricNoDataObserver);
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string {
        void event;
        return "net.missing";
    }
}

class TestStaticMetricKeysAction extends TestMetricAction {
    constructor(private metricKeys: readonly string[]) {
        super();
    }

    setMetricKeys(metricKeys: readonly string[]): void {
        this.metricKeys = metricKeys;
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        void event;
        return this.metricKeys;
    }
}

class TestCustomReadPlanAction extends TestMetricAction {
    constructor(private readonly readPlan: MetricReadPlan) {
        super();
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        void event;
        return listMetricReadPlanKeys(this.readPlan);
    }

    protected override buildMetricCollectionReadPlan(
        event: WillAppearEvent,
        metricKeys: readonly string[],
    ): MetricReadPlan {
        void event;
        void metricKeys;
        return this.readPlan;
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

class RecordingDisplayedMetricNoDataObserver implements DisplayedMetricNoDataObserver {
    readonly observations: DisplayedMetricNoDataObservation[] = [];
    readonly clearedActionIds: string[] = [];

    observe(observation: DisplayedMetricNoDataObservation): void {
        this.observations.push(observation);
    }

    clearAction(actionId: string): void {
        this.clearedActionIds.push(actionId);
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

function buildKeyDownEvent(action: FakeStreamDeckAction): KeyDownEvent {
    return { action } as unknown as KeyDownEvent;
}

function buildDialDownEvent(action: FakeStreamDeckAction): DialDownEvent {
    return { action } as unknown as DialDownEvent;
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

function buildTestWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        unit: "%",
        label: "NET",
    };
}

function createDeferredPromise(): {
    readonly promise: Promise<void>;
    resolve(): void;
} {
    let resolvePromise = (): void => {
        assert.fail("Deferred promise resolved before initialization.");
    };
    const promise = new Promise<void>(resolve => {
        resolvePromise = resolve;
    });

    return {
        promise,
        resolve: resolvePromise,
    };
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

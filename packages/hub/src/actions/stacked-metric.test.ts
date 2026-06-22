import assert from "node:assert/strict";
import { test } from "vitest";
import type {
    DialRotateEvent,
    KeyDownEvent,
    PropertyInspectorDidAppearEvent,
    SendToPluginEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { StackedMetric, type StackedMetricTimerScheduler } from "./stacked-metric";
import type { MetricCollectionBinding } from "./metric-action";
import { MetricUnit } from "../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
    type MetricDescriptorSnapshot,
    type SourceClientStatus,
} from "../runtime/sources/source-client";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";
import { CustomHttpDefinitionRegistry } from "../runtime/sources/custom-http/custom-http-definition-registry";
import { buildCustomHttpRuntimeIdentity, buildStackedCustomHttpConsumerSlug } from "../runtime/sources/custom-http/custom-http-metric-key";
import type { CustomHttpFetchOptions, CustomHttpFetchResult, CustomHttpFetcher } from "../runtime/sources/custom-http/custom-http-fetcher";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    type CustomHttpSourceEditorResponse,
} from "../runtime/sources/custom-http/custom-http-source-editor-messages";

test("stacked metric subscribes all slots and schedules default auto rotate", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-subscribe-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-1");
        assert.equal(action.bindings[0]?.refreshOptionsList.length, 1);
        assert.deepEqual(action.bindings[0]?.refreshOptionsList[0]?.readPlan.metrics.map(metric => metric.metricKey), [
            CPU_MODEL_METRIC_KEY,
            CPU_USAGE_METRIC_KEY,
            RAM_TOTAL_METRIC_KEY,
            RAM_USED_METRIC_KEY,
        ]);
        assert.equal(timers.scheduledTimers[0]?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric key press switches to the next slot and resets timers", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-key-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
        const firstAutoTimer = timers.scheduledTimers[0]?.handle;

        action.onKeyDown(buildKeyDownEvent(streamDeckAction));

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(action.indicatorVisible(streamDeckAction.id), true);
        assert.deepEqual(timers.clearedHandles, [firstAutoTimer]);
        assert.equal(timers.scheduledTimers.at(-2)?.delayMilliseconds, 1000);
        assert.equal(timers.scheduledTimers.at(-1)?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric dial rotation moves by tick count", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-dial-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings({
            thirdSlot: true,
        })));

        action.onDialRotate(buildDialRotateEvent(streamDeckAction, 2));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-3");

        action.onDialRotate(buildDialRotateEvent(streamDeckAction, -1));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric auto rotate can be disabled", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-disabled-auto-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings({
            autoRotateEnabled: false,
        })));

        assert.equal(timers.scheduledTimers.length, 0);
        action.onKeyDown(buildKeyDownEvent(streamDeckAction));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(timers.scheduledTimers.length, 1);
        assert.equal(timers.scheduledTimers[0]?.delayMilliseconds, 1000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric auto rotate timer switches and reschedules", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-auto-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
        const autoTimer = timers.scheduledTimers[0];

        timers.run(autoTimer?.handle);

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(action.indicatorVisible(streamDeckAction.id), true);
        assert.equal(timers.scheduledTimers.at(-1)?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric dispose clears auto and indicator timers", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-dispose-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
    action.onKeyDown(buildKeyDownEvent(streamDeckAction));
    const liveHandles = timers.scheduledTimers
        .map(timer => timer.handle)
        .filter(handle => !timers.clearedHandles.includes(handle));

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    for (const handle of liveHandles) {
        assert.equal(timers.clearedHandles.includes(handle), true);
    }
});

test("stacked metric publishes selected-slot picker caches to the Property Inspector", async () => {
    const timers = new FakeTimerScheduler();
    const descriptor = buildMetricDescriptor("source.sensor:/gpu/0/temperature");
    const diskVolume = buildDiskVolumeOption("E:\\");
    const networkInterface = buildNetworkInterfaceOption("ethernet-0");
    const action = new TestStackedMetric(timers, {
        descriptors: [descriptor],
        descriptorFingerprint: "stacked-catalog-fingerprint",
    });
    const streamDeckAction = new FakeStreamDeckAction("stacked-pi-cache-action");
    diskVolumeRegistry.update([diskVolume]);
    networkInterfaceRegistry.update([networkInterface]);

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
        action.refreshRuntimeCacheForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));
        await flushAsyncOperations();

        assert.deepEqual(action.runtimeCachePatchList.find(patch => patch.catalogMetricDescriptorLoadState === "ready"), {
            availableCatalogMetricDescriptors: [descriptor],
            catalogMetricDescriptorLoadState: "ready",
        });
        assert.deepEqual(action.runtimeCachePatchList.find(patch => patch.availableDiskVolumes !== undefined), {
            availableDiskVolumes: [diskVolume],
        });
        assert.deepEqual(action.runtimeCachePatchList.find(patch => patch.availableNetworkInterfaces !== undefined), {
            availableNetworkInterfaces: [networkInterface],
        });
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        diskVolumeRegistry.update([]);
        networkInterfaceRegistry.update([]);
    }
});

test("stacked metric registers and unregisters Custom HTTP slot definitions", () => {
    const timers = new FakeTimerScheduler();
    const definitionRegistry = new CustomHttpDefinitionRegistry();
    const action = new TestStackedMetric(timers, {
        descriptors: [],
        descriptorFingerprint: "empty",
    }, definitionRegistry);
    const streamDeckAction = new FakeStreamDeckAction("stacked-custom-http-action");
    const settings = buildStackedCustomHttpWidgetSettings();
    const metricKey = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/stacked",
        actionId: streamDeckAction.id,
        consumerSlug: buildStackedCustomHttpConsumerSlug("slot-1"),
    }).metricKey;

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, settings));

    assert.deepEqual(definitionRegistry.list().map(definition => definition.identity.metricKey), [metricKey]);

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.deepEqual(definitionRegistry.list(), []);
});

test("stacked metric handles Custom HTTP PI sample fetch messages", async () => {
    const timers = new FakeTimerScheduler();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"temp\":23.5}",
    });
    const action = new TestStackedMetric(timers, {
        descriptors: [],
        descriptorFingerprint: "empty",
    }, undefined, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("stacked-custom-http-pi-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedCustomHttpWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "stacked-fetch-1",
        consumerSlug: buildStackedCustomHttpConsumerSlug("slot-1"),
        url: "https://api.example.com/stacked",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await flushAsyncOperations();

    assert.equal(fetcher.urlList[0], "https://api.example.com/stacked");
    const response = action.customHttpSourceEditorResponses[0];
    assert.equal(response?.type, CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE);
    assert.equal(response?.command, "fetchSample");
    assert.equal(response?.requestId, "stacked-fetch-1");
    assert.equal(response?.result.ok, true);
});

class TestStackedMetric extends StackedMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    readonly customHttpSourceEditorResponses: CustomHttpSourceEditorResponse[] = [];

    constructor(
        timerScheduler: StackedMetricTimerScheduler,
        private readonly descriptorReadResult: MetricDescriptorSnapshot = {
            descriptors: [],
            descriptorFingerprint: "empty",
        },
        definitionRegistry?: CustomHttpDefinitionRegistry,
        options: {
            readonly fetcher?: CustomHttpFetcher | undefined;
        } = {},
    ) {
        super(timerScheduler, {
            customHttpDefinitionRegistry: definitionRegistry,
            fetcher: options.fetcher,
            sendCustomHttpSourceEditorResponse: (_event, response) => {
                this.customHttpSourceEditorResponses.push(response);
                return Promise.resolve();
            },
        });
    }

    activeSlotId(actionId: string): string | undefined {
        return this.readActiveSlotIdForTest(actionId);
    }

    indicatorVisible(actionId: string): boolean {
        return this.isIndicatorVisibleForTest(actionId);
    }

    refreshRuntimeCacheForTest(event: PropertyInspectorDidAppearEvent): void {
        this.refreshRuntimeCacheForPropertyInspector(event);
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        void event;
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = new FakeMetricCollectionBinding();
        this.bindings.push(binding);
        return binding;
    }

    protected override readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        return Promise.resolve(this.descriptorReadResult);
    }

    protected override refreshDiskVolumesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        void event;
        this.runtimeCachePatchList.push({
            availableDiskVolumes: [...diskVolumeRegistry.getOptions()],
        });
        return Promise.resolve();
    }

    protected override refreshNetworkInterfacesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        void event;
        this.runtimeCachePatchList.push({
            availableNetworkInterfaces: [...networkInterfaceRegistry.getOptions()],
        });
        return Promise.resolve();
    }

    protected override currentPlatform(): NodeJS.Platform {
        return "win32";
    }

    protected override readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        void sourceId;
        return undefined;
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

class FakeTimerScheduler implements StackedMetricTimerScheduler {
    readonly scheduledTimers: Array<{
        readonly handle: number;
        readonly delayMilliseconds: number;
        readonly callback: () => void;
    }> = [];
    readonly clearedHandles: number[] = [];
    private nextHandle = 1;

    set(callback: () => void, delayMilliseconds: number): number {
        const handle = this.nextHandle;
        this.nextHandle += 1;
        this.scheduledTimers.push({ handle, delayMilliseconds, callback });
        return handle;
    }

    clear(handle: unknown): void {
        if (typeof handle === "number") {
            this.clearedHandles.push(handle);
        }
    }

    run(handle: number | undefined): void {
        const timer = this.scheduledTimers.find(candidateTimer => candidateTimer.handle === handle);
        if (timer === undefined) {
            throw new Error(`Unknown fake timer handle: ${String(handle)}`);
        }

        timer.callback();
    }
}

class FakeCustomHttpFetcher implements CustomHttpFetcher {
    readonly urlList: string[] = [];
    readonly optionsList: CustomHttpFetchOptions[] = [];

    constructor(private readonly result: CustomHttpFetchResult) {}

    fetchJson(url: string, options?: CustomHttpFetchOptions): Promise<CustomHttpFetchResult> {
        this.urlList.push(url);
        this.optionsList.push(options ?? {});
        return Promise.resolve(this.result);
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

function buildStackedWidgetSettings(options: {
    readonly autoRotateEnabled?: boolean | undefined;
    readonly thirdSlot?: boolean | undefined;
} = {}): unknown {
    const slotIds = ["slot-1", "slot-2", "slot-3"];
    const createSlotId = (): string => slotIds.shift() ?? "unexpected-slot";
    let rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId,
    }).rawSettings;

    if (options.thirdSlot === true) {
        rawSettings = writeStoredWidgetSettingsPatch(rawSettings, {
            stacked: {
                addSlot: {},
            },
        }, { createSlotId });
    }

    if (options.autoRotateEnabled !== undefined) {
        rawSettings = writeStoredWidgetSettingsPatch(rawSettings, {
            stacked: {
                rotation: {
                    autoRotateEnabled: options.autoRotateEnabled,
                },
            },
        });
    }

    return rawSettings;
}

function buildStackedCustomHttpWidgetSettings(): unknown {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId: createSequentialSlotIdGenerator(["slot-1", "slot-2"]),
    }).rawSettings;

    return writeStoredWidgetSettingsPatch(rawSettings, {
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "customMetric",
                singleMetric: {
                    customMetric: {
                        url: "https://api.example.com/stacked",
                        userIntent: "show stacked",
                        jqTransform: ".stacked",
                    },
                },
            },
        },
    });
}

function createSequentialSlotIdGenerator(slotIds: readonly string[]): () => string {
    const remainingSlotIds = [...slotIds];
    return () => remainingSlotIds.shift() ?? "unexpected-slot";
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

function buildKeyDownEvent(action: FakeStreamDeckAction): KeyDownEvent {
    return { action } as unknown as KeyDownEvent;
}

function buildDialRotateEvent(action: FakeStreamDeckAction, ticks: number): DialRotateEvent {
    return {
        action,
        payload: { ticks },
    } as unknown as DialRotateEvent;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

function buildSendToPluginEvent(action: FakeStreamDeckAction, payload: unknown): SendToPluginEvent<never, Record<string, never>> {
    return {
        action,
        payload,
    } as unknown as SendToPluginEvent<never, Record<string, never>>;
}

function defaultSourceEditorAuthReference() {
    return {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    };
}

async function flushAsyncOperations(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
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

function buildDiskVolumeOption(id: string): DiskVolumeOption {
    return {
        id,
        fs: "NTFS",
        mount: id,
        sizeBytes: 512 * 1024 * 1024 * 1024,
        usedBytes: 256 * 1024 * 1024 * 1024,
        availableBytes: 256 * 1024 * 1024 * 1024,
        storageKind: "ssd",
        diskName: "Test Disk",
        volumeLabel: "Data",
    };
}

function buildNetworkInterfaceOption(id: string): NetworkInterfaceOption {
    return {
        id,
        name: "Ethernet",
        type: "wired",
        isDefault: true,
        speedMegabitsPerSecond: 1000,
    };
}

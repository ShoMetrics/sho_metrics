import assert from "node:assert/strict";
import test from "node:test";
import type { PropertyInspectorDidAppearEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { DenseMultiMetric } from "./dense-multi-metric";
import type { MetricCollectionBinding } from "./metric-action";
import { MetricUnit } from "../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
    type MetricDescriptorSnapshot,
    type SourceClientStatus,
} from "../runtime/sources/source-client";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { diskVolumeRegistry, type DiskVolumeOption } from "../runtime/disk-volumes";
import { networkInterfaceRegistry, type NetworkInterfaceOption } from "../runtime/network-interfaces";
import { resolveDiskUsageMetricSubscriptionKeys } from "./disk/metric-subscriptions";
import {
    CustomHttpDefinitionRegistry,
} from "../runtime/sources/custom-http/custom-http-definition-registry";
import { buildCustomHttpRuntimeIdentity, buildDenseCustomHttpConsumerSlug } from "../runtime/sources/custom-http/custom-http-metric-key";
import type { CustomHttpFetchOptions, CustomHttpFetchResult, CustomHttpFetcher } from "../runtime/sources/custom-http/custom-http-fetcher";
import type { CustomHttpSourceEditorResponse } from "../runtime/sources/custom-http/custom-http-source-editor-messages";
import type {
    CustomHttpTransformResult,
    CustomHttpTransformRunner,
} from "../runtime/sources/custom-http/custom-http-transform-worker-pool";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";

test("dense multi metric publishes catalog descriptors to the Property Inspector runtime cache", async () => {
    const descriptor = buildMetricDescriptor("source.sensor:/gpu/0/temperature");
    const action = new TestDenseMultiMetric({
        descriptors: [descriptor],
        descriptorFingerprint: "catalog-fingerprint",
    });
    const streamDeckAction = new FakeStreamDeckAction("dense-catalog-descriptor-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildDenseWidgetSettings()));
        action.refreshRuntimeCacheForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));
        await flushAsyncOperations();

        assert.deepEqual(action.runtimeCachePatchList.find(patch => patch.catalogMetricDescriptorLoadState === "ready"), {
            availableCatalogMetricDescriptors: [descriptor],
            catalogMetricDescriptorLoadState: "ready",
        });
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("dense multi metric publishes disk volume options to the Property Inspector runtime cache", async () => {
    const diskVolume = buildDiskVolumeOption("E:\\");
    const action = new TestDenseMultiMetric({
        descriptors: [],
        descriptorFingerprint: "empty",
    });
    const streamDeckAction = new FakeStreamDeckAction("dense-disk-volume-action");
    diskVolumeRegistry.update([diskVolume]);

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildDenseWidgetSettings()));
        await action.refreshDiskVolumesForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.deepEqual(action.refreshedMetricKeysList.at(-1), resolveDiskUsageMetricSubscriptionKeys(undefined));
        assert.deepEqual(action.runtimeCachePatchList.at(-1), {
            availableDiskVolumes: [diskVolume],
        });
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        diskVolumeRegistry.update([]);
    }
});

test("dense multi metric publishes network interface options to the Property Inspector runtime cache", async () => {
    const networkInterface = buildNetworkInterfaceOption("ethernet-0");
    const action = new TestDenseMultiMetric({
        descriptors: [],
        descriptorFingerprint: "empty",
    });
    const streamDeckAction = new FakeStreamDeckAction("dense-network-interface-action");
    networkInterfaceRegistry.update([networkInterface]);

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildDenseWidgetSettings()));
        await action.refreshNetworkInterfacesForTest(buildPropertyInspectorDidAppearEvent(streamDeckAction));

        assert.deepEqual(action.runtimeCachePatchList.at(-1), {
            availableNetworkInterfaces: [networkInterface],
        });
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
        networkInterfaceRegistry.update([]);
    }
});

test("dense multi metric registers and unregisters Custom HTTP row definitions", () => {
    const definitionRegistry = new CustomHttpDefinitionRegistry();
    const action = new TestDenseMultiMetric({
        descriptors: [],
        descriptorFingerprint: "empty",
    }, definitionRegistry);
    const streamDeckAction = new FakeStreamDeckAction("dense-custom-http-action");
    const settings = buildDenseCustomHttpWidgetSettings();
    const firstMetricKey = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/first",
        actionId: streamDeckAction.id,
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
    }).metricKey;
    const secondMetricKey = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/second",
        actionId: streamDeckAction.id,
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-2"),
    }).metricKey;

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, settings));

    assert.deepEqual(definitionRegistry.list().map(definition => definition.identity.metricKey), [
        firstMetricKey,
        secondMetricKey,
    ].sort());

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.deepEqual(definitionRegistry.list(), []);
});

test("dense multi metric handles Custom HTTP PI sample fetch messages", async () => {
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"temp\":23.5}",
    });
    const action = new TestDenseMultiMetric({
        descriptors: [],
        descriptorFingerprint: "empty",
    }, undefined, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("dense-custom-http-pi-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildDenseCustomHttpWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: "custom-http-pi-test",
        command: "fetchSample",
        requestId: "dense-fetch-1",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
        url: "https://api.example.com/first",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    }));
    await flushAsyncOperations();

    assert.equal(fetcher.urlList[0], "https://api.example.com/first");
    const response = action.customHttpSourceEditorResponses[0];
    assert.equal(response?.type, "custom-http-pi-test");
    assert.equal(response?.command, "fetchSample");
    assert.equal(response?.requestId, "dense-fetch-1");
    assert.equal(response?.result.ok, true);
    if (response?.result.ok === true) {
        assert.equal(response.result.responseBytes, 13);
        assert.equal(Number.isInteger(response.result.elapsedMilliseconds), true);
        assert.equal(response.result.samplePreview, "{\"temp\":23.5}");
        assert.equal(response.result.isSamplePreviewTruncated, false);
        assert.deepEqual(response.result.promptSample, {
            kind: "jsonSample",
            text: "{\"temp\":23.5}",
        });
    }
});

test("dense multi metric keeps Custom HTTP PI samples isolated by row consumer", async () => {
    const fetcher = new FakeCustomHttpFetcherByUrl(new Map([
        ["https://api.example.com/first", { ok: true, responseText: "{\"first\":1}" }],
        ["https://api.example.com/second", { ok: true, responseText: "{\"second\":2}" }],
    ]));
    const transformRunner = new FakeCustomHttpTransformRunner({
        ok: true,
        output: { metric: { label: "FIRST", value: 1, unit: "unitless" } },
    });
    const action = new TestDenseMultiMetric({
        descriptors: [],
        descriptorFingerprint: "empty",
    }, undefined, { fetcher, transformRunner });
    const streamDeckAction = new FakeStreamDeckAction("dense-custom-http-pi-cache-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildDenseCustomHttpWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: "custom-http-pi-test",
        command: "fetchSample",
        requestId: "first-fetch",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
        url: "https://api.example.com/first",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    }));
    await flushAsyncOperations();
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: "custom-http-pi-test",
        command: "fetchSample",
        requestId: "second-fetch",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-2"),
        url: "https://api.example.com/second",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    }));
    await flushAsyncOperations();

    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: "custom-http-pi-test",
        command: "testTransform",
        requestId: "first-transform",
        consumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
        url: "https://api.example.com/first",
        jqTransform: ".first",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    }));
    await flushAsyncOperations();

    assert.deepEqual(transformRunner.inputJsonList, [{ first: 1 }]);
    assert.equal(action.customHttpSourceEditorResponses.at(-1)?.requestId, "first-transform");
    assert.equal(action.customHttpSourceEditorResponses.at(-1)?.result.ok, true);
});

class TestDenseMultiMetric extends DenseMultiMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    readonly refreshedMetricKeysList: string[][] = [];
    readonly customHttpSourceEditorResponses: CustomHttpSourceEditorResponse[] = [];

    constructor(
        private readonly descriptorReadResult: MetricDescriptorSnapshot,
        definitionRegistry?: CustomHttpDefinitionRegistry,
        options: {
            readonly fetcher?: CustomHttpFetcher | undefined;
            readonly transformRunner?: CustomHttpTransformRunner | undefined;
        } = {},
    ) {
        super({
            customHttpDefinitionRegistry: definitionRegistry,
            fetcher: options.fetcher,
            transformRunner: options.transformRunner,
            sendCustomHttpSourceEditorResponse: (_event, response) => {
                this.customHttpSourceEditorResponses.push(response);
                return Promise.resolve();
            },
        });
    }

    refreshRuntimeCacheForTest(event: PropertyInspectorDidAppearEvent): void {
        this.refreshRuntimeCacheForPropertyInspector(event);
    }

    refreshDiskVolumesForTest(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return this.refreshDiskVolumesForPropertyInspector(event);
    }

    refreshNetworkInterfacesForTest(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return this.refreshNetworkInterfacesForPropertyInspector(event);
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

    protected override currentPlatform(): NodeJS.Platform {
        return "win32";
    }

    protected override readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        void sourceId;
        return undefined;
    }

    protected override refreshDiskVolumeRuntimeCacheForPropertyInspector(
        event: PropertyInspectorDidAppearEvent,
    ): Promise<void> {
        void event;
        this.refreshedMetricKeysList.push([...resolveDiskUsageMetricSubscriptionKeys(undefined)]);
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

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        void event;
        this.runtimeCachePatchList.push(patch);
        return Promise.resolve();
    }
}

async function flushAsyncOperations(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
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

class FakeCustomHttpFetcherByUrl implements CustomHttpFetcher {
    constructor(private readonly resultByUrl: ReadonlyMap<string, CustomHttpFetchResult>) {}

    fetchJson(url: string): Promise<CustomHttpFetchResult> {
        const result = this.resultByUrl.get(url);
        if (result === undefined) {
            throw new Error(`Unexpected URL: ${url}`);
        }

        return Promise.resolve(result);
    }
}

class FakeCustomHttpTransformRunner implements CustomHttpTransformRunner {
    readonly inputJsonList: unknown[] = [];

    constructor(private readonly result: CustomHttpTransformResult) {}

    runTransform(options: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
    }): Promise<CustomHttpTransformResult> {
        void options.jqTransform;
        this.inputJsonList.push(options.inputJson);
        return Promise.resolve(this.result);
    }

    dispose(): void {
        return;
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

function buildDenseWidgetSettings(): unknown {
    return {
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    };
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

function buildDenseCustomHttpWidgetSettings(): unknown {
    let rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "denseMultiMetric", {
        createSlotId: createSequentialSlotIdGenerator(["slot-1", "slot-2"]),
    }).rawSettings;
    rawSettings = writeStoredWidgetSettingsPatch(rawSettings, {
        dense: {
            updateSlot: {
                slotId: "slot-1",
                target: { domain: "customMetric" },
                customMetric: {
                    url: "https://api.example.com/first",
                    userIntent: "show first",
                    jqTransform: ".first",
                },
            },
        },
    });
    return writeStoredWidgetSettingsPatch(rawSettings, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: { domain: "customMetric" },
                customMetric: {
                    url: "https://api.example.com/second",
                    userIntent: "show second",
                    jqTransform: ".second",
                },
            },
        },
    });
}

function createSequentialSlotIdGenerator(slotIds: readonly string[]): () => string {
    const remainingSlotIds = [...slotIds];
    return () => remainingSlotIds.shift() ?? "unexpected-slot";
}

function buildNetworkInterfaceOption(id: string): NetworkInterfaceOption {
    return {
        id,
        name: "Ethernet",
        type: "wired",
        isDefault: true,
        speedMegabitsPerSecond: null,
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

function buildSendToPluginEvent(action: FakeStreamDeckAction, payload: unknown): SendToPluginEvent<never, Record<string, never>> {
    return {
        action,
        payload,
    } as unknown as SendToPluginEvent<never, Record<string, never>>;
}

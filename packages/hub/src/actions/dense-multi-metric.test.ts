import assert from "node:assert/strict";
import test from "node:test";
import type { PropertyInspectorDidAppearEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
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
import { resolveDiskUsageMetricSubscriptionKeys } from "./disk/metric-subscriptions";

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

class TestDenseMultiMetric extends DenseMultiMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly runtimeCachePatchList: WidgetRuntimeCachePatch[] = [];
    readonly refreshedMetricKeysList: string[][] = [];

    constructor(private readonly descriptorReadResult: MetricDescriptorSnapshot) {
        super();
    }

    refreshRuntimeCacheForTest(event: PropertyInspectorDidAppearEvent): void {
        this.refreshRuntimeCacheForPropertyInspector(event);
    }

    refreshDiskVolumesForTest(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return this.refreshDiskVolumesForPropertyInspector(event);
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

import { deepEqual } from "fast-equals";
import type {
    BatteryDeviceDescriptor,
    BatteryDeviceDiscoveryDiagnostics,
} from "./sources/battery/battery-device-descriptor";
import type { DiskVolumeOption } from "./disk-volumes";
import type { NetworkInterfaceOption } from "./network-interfaces";
import type {
    MetricDescriptor,
    MetricUnavailableReason,
    MetricValueFreshness,
    SourceClientStatus,
} from "./sources/source-client";

/**
 * Ephemeral per-action runtime facts.
 *
 * This cache is intentionally not part of persisted Stream Deck settings. It is
 * rebuilt while the plugin is running and may be sent to the Property Inspector
 * for the current session only.
 */
export interface WidgetRuntimeCache {
    availableNetworkInterfaces: NetworkInterfaceOption[];
    availableDiskVolumes: DiskVolumeOption[];
    availableBatteryDevices: readonly BatteryDeviceDescriptor[];
    batteryDeviceDiscoveryDiagnostics: BatteryDeviceDiscoveryDiagnostics | undefined;
    availableCatalogMetricDescriptors: readonly MetricDescriptor[];
    catalogMetricDescriptorLoadState: WidgetRuntimeCacheLoadState;
    catalogMetricDescriptorSourceStatus: SourceClientStatus | undefined;
    runtimeMaximumDownloadSpeedMbps: number | undefined;
    runtimeMaximumUploadSpeedMbps: number | undefined;
    runtimeMaximumDiskReadThroughputMebibytesPerSecond: number | undefined;
    runtimeMaximumDiskWriteThroughputMebibytesPerSecond: number | undefined;
    runtimeMaximumGpuPowerWatts: number | undefined;
    displayedMetricReadTrace: DisplayedMetricReadTrace | undefined;
}
export type WidgetRuntimeCacheLoadState = "pending" | "ready" | "failed";

/** Latest routing and outcome trace for the primary metric displayed by an action. */
export interface DisplayedMetricReadTrace {
    readonly metricKey: string;
    readonly routing: DisplayedMetricReadRouting;
    readonly preferredSourceStatus?: SourceClientStatus;
    readonly outcome: DisplayedMetricReadOutcome | undefined;
}

export interface DisplayedMetricReadRouting {
    readonly preferredSourceId: string | undefined;
    readonly selectedSourceId: string | undefined;
}

export type DisplayedMetricReadOutcome =
    | DisplayedMetricValueOutcome
    | DisplayedMetricUnavailableOutcome;

export interface DisplayedMetricValueOutcome {
    readonly kind: "value";
    readonly valueTimestampMilliseconds: number;
    readonly freshness: MetricValueFreshness;
    readonly retainedAgeMilliseconds?: number;
    readonly rawSensorIdentity?: DisplayedRawSensorIdentity;
}

export interface DisplayedMetricUnavailableOutcome {
    readonly kind: "unavailable";
    readonly reason: DisplayedMetricUnavailableReason;
    readonly lastValueTimestampMilliseconds: number | undefined;
    readonly rawSensorIdentity?: DisplayedRawSensorIdentity;
}

export interface DisplayedRawSensorIdentity {
    readonly sourceSensorId?: string;
    readonly hardwareId?: string;
    readonly sensorName?: string;
    readonly hardwareName?: string;
}

export type DisplayedMetricUnavailableReason = MetricUnavailableReason;

export type WidgetRuntimeCachePatch = Partial<WidgetRuntimeCache>;

export const emptyWidgetRuntimeCache: WidgetRuntimeCache = {
    availableNetworkInterfaces: [],
    availableDiskVolumes: [],
    availableBatteryDevices: [],
    batteryDeviceDiscoveryDiagnostics: undefined,
    availableCatalogMetricDescriptors: [],
    catalogMetricDescriptorLoadState: "pending",
    catalogMetricDescriptorSourceStatus: undefined,
    runtimeMaximumDownloadSpeedMbps: undefined,
    runtimeMaximumUploadSpeedMbps: undefined,
    runtimeMaximumDiskReadThroughputMebibytesPerSecond: undefined,
    runtimeMaximumDiskWriteThroughputMebibytesPerSecond: undefined,
    runtimeMaximumGpuPowerWatts: undefined,
    displayedMetricReadTrace: undefined,
};

export const WIDGET_RUNTIME_CACHE_MESSAGE_TYPE = "widget-runtime-cache";

export interface WidgetRuntimeCacheMessage {
    type: typeof WIDGET_RUNTIME_CACHE_MESSAGE_TYPE;
    patch: WidgetRuntimeCachePatch;
}

export class WidgetRuntimeCacheStore {
    private runtimeCache: WidgetRuntimeCache = { ...emptyWidgetRuntimeCache };

    current(): WidgetRuntimeCache {
        return this.runtimeCache;
    }

    update(patch: WidgetRuntimeCachePatch): boolean {
        if (isWidgetRuntimeCachePatchUnchanged(this.runtimeCache, patch)) {
            return false;
        }

        this.runtimeCache = mergeWidgetRuntimeCache(this.runtimeCache, patch);
        return true;
    }
}

export function mergeWidgetRuntimeCache(
    runtimeCache: WidgetRuntimeCache,
    patch: WidgetRuntimeCachePatch,
): WidgetRuntimeCache {
    return {
        ...runtimeCache,
        ...patch,
    };
}

function isWidgetRuntimeCachePatchUnchanged(
    runtimeCache: WidgetRuntimeCache,
    patch: WidgetRuntimeCachePatch,
): boolean {
    return (Object.keys(patch) as Array<keyof WidgetRuntimeCache>).every((key) => {
        return deepEqual(runtimeCache[key], patch[key]);
    });
}

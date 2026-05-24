import { deepEqual } from "fast-equals";
import type { DiskVolumeOption } from "./disk-volumes";
import type { NetworkInterfaceOption } from "./network-interfaces";

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
    runtimeMaximumDownloadSpeedMbps: number | undefined;
    runtimeMaximumUploadSpeedMbps: number | undefined;
    runtimeMaximumDiskReadThroughputMebibytesPerSecond: number | undefined;
    runtimeMaximumDiskWriteThroughputMebibytesPerSecond: number | undefined;
    runtimeMaximumGpuPowerWatts: number | undefined;
    displayedMetricReadAttribution: DisplayedMetricReadAttribution | undefined;
}

/** Latest render-path source attribution for the primary metric displayed by an action. */
export interface DisplayedMetricReadAttribution {
    readonly metricKey: string;
    readonly preferredSourceId: string | undefined;
    readonly selectedSourceId: string | undefined;
    readonly sampleTimestampMilliseconds: number | undefined;
}

export type WidgetRuntimeCachePatch = Partial<WidgetRuntimeCache>;

export const emptyWidgetRuntimeCache: WidgetRuntimeCache = {
    availableNetworkInterfaces: [],
    availableDiskVolumes: [],
    runtimeMaximumDownloadSpeedMbps: undefined,
    runtimeMaximumUploadSpeedMbps: undefined,
    runtimeMaximumDiskReadThroughputMebibytesPerSecond: undefined,
    runtimeMaximumDiskWriteThroughputMebibytesPerSecond: undefined,
    runtimeMaximumGpuPowerWatts: undefined,
    displayedMetricReadAttribution: undefined,
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

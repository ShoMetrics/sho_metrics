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
    learnedMaximumDownloadSpeedMbps: number | undefined;
    learnedMaximumUploadSpeedMbps: number | undefined;
    learnedMaximumDiskReadThroughputMebibytesPerSecond: number | undefined;
    learnedMaximumDiskWriteThroughputMebibytesPerSecond: number | undefined;
}

export type WidgetRuntimeCachePatch = Partial<WidgetRuntimeCache>;

export const emptyWidgetRuntimeCache: WidgetRuntimeCache = {
    availableNetworkInterfaces: [],
    availableDiskVolumes: [],
    learnedMaximumDownloadSpeedMbps: undefined,
    learnedMaximumUploadSpeedMbps: undefined,
    learnedMaximumDiskReadThroughputMebibytesPerSecond: undefined,
    learnedMaximumDiskWriteThroughputMebibytesPerSecond: undefined,
};

export const WIDGET_RUNTIME_CACHE_MESSAGE_TYPE = "widget-runtime-cache";

export interface WidgetRuntimeCacheMessage {
    type: typeof WIDGET_RUNTIME_CACHE_MESSAGE_TYPE;
    patch: WidgetRuntimeCachePatch;
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

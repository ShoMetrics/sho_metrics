import type { WidgetRuntimeCache } from "../../runtime/widget-runtime-cache";
import { readStoredGlobalSettings } from "../../settings/storage/codec";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { resolveStoredWidgetSettings } from "../../settings/storage/resolver";
import type { ActionKind } from "../../shared/stream-deck-actions";
import type { PropertyInspectorRuntimeCacheStatus, VisibilityContext } from "./types";
import type { PropertyInspectorPlatform } from "./platform";

export function buildPropertyInspectorContext(options: {
    rawSettings: unknown;
    rawGlobalSettings: unknown;
    runtimeCache: WidgetRuntimeCache;
    runtimeCacheStatus: PropertyInspectorRuntimeCacheStatus;
    actionKind: ActionKind;
    platform: PropertyInspectorPlatform;
    isWindows: boolean;
}): VisibilityContext {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(options.rawSettings, options.actionKind);

    return {
        actionKind: options.actionKind,
        platform: options.platform,
        isWindows: options.isWindows,
        runtimeCache: options.runtimeCache,
        runtimeCacheStatus: options.runtimeCacheStatus,
        resolved: resolveStoredWidgetSettings({
            storedWidgetSettings: quickStartSettings.storedSettings,
            storedGlobalSettings: readStoredGlobalSettings(options.rawGlobalSettings).settings,
            runtime: {
                isWindows: options.isWindows,
                runtimeMaximumDownloadSpeedMegabitsPerSecond: options.runtimeCache.runtimeMaximumDownloadSpeedMbps,
                runtimeMaximumUploadSpeedMegabitsPerSecond: options.runtimeCache.runtimeMaximumUploadSpeedMbps,
                runtimeMaximumDiskReadThroughputMebibytesPerSecond:
                    options.runtimeCache.runtimeMaximumDiskReadThroughputMebibytesPerSecond,
                runtimeMaximumDiskWriteThroughputMebibytesPerSecond:
                    options.runtimeCache.runtimeMaximumDiskWriteThroughputMebibytesPerSecond,
                runtimeMaximumGpuPowerWatts: options.runtimeCache.runtimeMaximumGpuPowerWatts,
            },
        }),
    };
}

import type { WidgetRuntimeCache } from "../../runtime/widget-runtime-cache";
import { readStoredGlobalSettings, readStoredWidgetSettings } from "../../settings/storage/codec";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import { resolveStoredWidgetSettings } from "../../settings/storage/resolver";
import type { ActionKind } from "../../shared/stream-deck-actions";
import type { VisibilityContext } from "./types";

export function buildPropertyInspectorContext(options: {
    rawSettings: unknown;
    rawGlobalSettings: unknown;
    runtimeCache: WidgetRuntimeCache;
    actionKind: ActionKind;
    isWindows: boolean;
}): VisibilityContext {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(options.rawSettings, options.actionKind);

    return {
        actionKind: options.actionKind,
        isWindows: options.isWindows,
        runtimeCache: options.runtimeCache,
        resolved: resolveStoredWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings(quickStartSettings.rawSettings),
            storedGlobalSettings: readStoredGlobalSettings(options.rawGlobalSettings),
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

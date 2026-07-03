import { pluginGlobalSettingsStore } from "../../settings/global-settings-store";
import { logger } from "../../logging/node-logger";
import type { ActionKind } from "../../shared/stream-deck-actions";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import type { ResolvedWidgetSettings } from "../../settings/resolved-settings";
import { readStoredWidgetSettings, type StoredSettingsJsonObject } from "../../settings/storage/codec";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    resolveStoredWidgetSettings,
    type ResolveStoredSettingsRuntimeContext,
} from "../../settings/storage/resolver";

const log = logger.for("ActionSettingsResolver");

export interface ResolvedInitialActionSettings {
    readonly rawSettings: unknown;
    readonly settingsJsonToPersist: StoredSettingsJsonObject | null;
    readonly resolvedSettings: ResolvedWidgetSettings;
}

export function resolveInitialActionSettings(
    rawSettings: unknown,
    actionKind: ActionKind,
    runtimeCache?: WidgetRuntimeCachePatch,
): ResolvedInitialActionSettings {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(rawSettings, actionKind);

    return {
        ...quickStartSettings,
        resolvedSettings: resolveActionSettings(quickStartSettings.rawSettings, runtimeCache),
    };
}

export function resolveActionSettings(
    rawSettings: unknown,
    runtimeCache?: WidgetRuntimeCachePatch,
): ResolvedWidgetSettings {
    const widgetSettingsRead = readStoredWidgetSettings(rawSettings);
    const readWarning = widgetSettingsRead.warning;
    if (readWarning) {
        log.warn(() => `Widget settings read warning: ${readWarning.message}`);
    }

    return resolveStoredWidgetSettings({
        storedWidgetSettings: widgetSettingsRead.settings,
        storedGlobalSettings: pluginGlobalSettingsStore.getStored(),
        runtime: resolveRuntimeContext(runtimeCache),
    });
}

function resolveRuntimeContext(
    runtimeCache: WidgetRuntimeCachePatch | undefined,
): ResolveStoredSettingsRuntimeContext {
    return {
        isWindows: process.platform === "win32",
        runtimeMaximumDownloadSpeedMegabitsPerSecond: runtimeCache?.runtimeMaximumDownloadSpeedMbps,
        runtimeMaximumUploadSpeedMegabitsPerSecond: runtimeCache?.runtimeMaximumUploadSpeedMbps,
        runtimeMaximumDiskReadThroughputMebibytesPerSecond:
            runtimeCache?.runtimeMaximumDiskReadThroughputMebibytesPerSecond,
        runtimeMaximumDiskWriteThroughputMebibytesPerSecond:
            runtimeCache?.runtimeMaximumDiskWriteThroughputMebibytesPerSecond,
        runtimeMaximumGpuPowerWatts: runtimeCache?.runtimeMaximumGpuPowerWatts,
    };
}

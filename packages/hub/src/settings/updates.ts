import { normalizeWidgetStoredSettings } from "./widget-settings";
import type { WidgetSettings } from "./model";

type WidgetSettingsBranch =
    | "metric"
    | "local"
    | "appearanceOverrides"
    | "networkOverrides"
    | "diskThroughputOverrides";

type WidgetSettingsBranchPatch<TBranch extends WidgetSettingsBranch> =
    NonNullable<WidgetSettings[TBranch]>;

export interface RuntimeStatePatch {
    availableNetworkInterfaces?: string;
    availableDiskVolumes?: string;
    learnedMaximumDownloadSpeedMbps?: number;
    learnedMaximumUploadSpeedMbps?: number;
    learnedMaximumDiskReadThroughputMebibytesPerSecond?: number;
    learnedMaximumDiskWriteThroughputMebibytesPerSecond?: number;
}

export function updateWidgetSettingsBranch<TBranch extends WidgetSettingsBranch>(
    settings: WidgetSettings,
    branch: TBranch,
    patch: WidgetSettingsBranchPatch<TBranch>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        [branch]: {
            ...settings[branch],
            ...patch,
        },
    });
}

export function updateWidgetRuntimeCache(
    settings: WidgetSettings,
    patch: RuntimeStatePatch,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        runtimeCache: {
            ...settings.runtimeCache,
            ...patch,
        },
    });
}

function sanitizeWidgetSettings(settings: WidgetSettings): WidgetSettings {
    return normalizeWidgetStoredSettings(settings);
}

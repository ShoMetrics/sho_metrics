import { sanitizeWidgetSettings } from "./widget-settings";
import type { AppearanceColorRampKey, AppearanceSettingsOverride, WidgetSettings } from "./model";

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
    return mergeWidgetSettingsPatch(settings, {
        [branch]: patch,
    });
}

export function mergeWidgetSettingsPatch(settings: WidgetSettings, patch: WidgetSettings): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        ...patch,
        metric: patch.metric ? { ...settings.metric, ...patch.metric } : settings.metric,
        local: patch.local ? { ...settings.local, ...patch.local } : settings.local,
        appearanceOverrides: patch.appearanceOverrides
            ? mergeAppearancePatch(settings.appearanceOverrides, patch.appearanceOverrides)
            : settings.appearanceOverrides,
        networkOverrides: patch.networkOverrides
            ? { ...settings.networkOverrides, ...patch.networkOverrides }
            : settings.networkOverrides,
        diskThroughputOverrides: patch.diskThroughputOverrides
            ? { ...settings.diskThroughputOverrides, ...patch.diskThroughputOverrides }
            : settings.diskThroughputOverrides,
        runtimeCache: patch.runtimeCache
            ? { ...settings.runtimeCache, ...patch.runtimeCache }
            : settings.runtimeCache,
    });
}

export function updateWidgetRuntimeCache(
    settings: WidgetSettings,
    patch: RuntimeStatePatch,
): WidgetSettings {
    return mergeWidgetSettingsPatch(settings, {
        runtimeCache: patch,
    });
}

const colorRampKeys: readonly AppearanceColorRampKey[] = [
    "usageColors",
    "downloadColors",
    "uploadColors",
    "diskReadColors",
    "diskWriteColors",
];

function mergeAppearancePatch(
    settings: AppearanceSettingsOverride | undefined,
    patch: AppearanceSettingsOverride,
): AppearanceSettingsOverride {
    const output: AppearanceSettingsOverride = {
        ...settings,
        ...patch,
    };

    for (const rampKey of colorRampKeys) {
        if (patch[rampKey]) {
            output[rampKey] = {
                ...settings?.[rampKey],
                ...patch[rampKey],
            };
        }
    }

    return output;
}

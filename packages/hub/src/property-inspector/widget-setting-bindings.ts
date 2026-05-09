import {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultRuntimeCache,
    normalizeWidgetStoredSettings,
    type AppearanceColorRampKey,
    type AppearanceScalarSettings,
    type AppearanceSettingsOverride,
    type ColorRamp,
    type DiskThroughputDefaultSettings,
    type MetricSettings,
    type NetworkDefaultSettings,
    type PluginGlobalSettings,
    type SettingsContext,
    type WidgetLocalSettings,
    type WidgetSettings,
    type WidgetRuntimeCache,
    type WidgetStoredSettings,
} from "../settings/widget-settings";
import {
    updateWidgetSettingsBranch,
} from "../settings/updates";
import { resolveWidgetSettings } from "../settings/resolver";
import type {
    AppearanceColorControlKey,
    InspectorControlValue,
    PropertyInspectorSettingKey,
    VisibilityContext,
} from "./schema";

export type InspectorBindingContext = VisibilityContext;

const APPEARANCE_COLOR_CONTROL_PATHS = {
    solidColor: { rampKey: "usageColors", colorKey: "solidColor" },
    colorLow: { rampKey: "usageColors", colorKey: "lowColor" },
    colorMedium: { rampKey: "usageColors", colorKey: "mediumColor" },
    colorHigh: { rampKey: "usageColors", colorKey: "highColor" },
    downloadSolidColor: { rampKey: "downloadColors", colorKey: "solidColor" },
    downloadColorLow: { rampKey: "downloadColors", colorKey: "lowColor" },
    downloadColorMedium: { rampKey: "downloadColors", colorKey: "mediumColor" },
    downloadColorHigh: { rampKey: "downloadColors", colorKey: "highColor" },
    uploadSolidColor: { rampKey: "uploadColors", colorKey: "solidColor" },
    uploadColorLow: { rampKey: "uploadColors", colorKey: "lowColor" },
    uploadColorMedium: { rampKey: "uploadColors", colorKey: "mediumColor" },
    uploadColorHigh: { rampKey: "uploadColors", colorKey: "highColor" },
    diskReadSolidColor: { rampKey: "diskReadColors", colorKey: "solidColor" },
    diskReadColorLow: { rampKey: "diskReadColors", colorKey: "lowColor" },
    diskReadColorMedium: { rampKey: "diskReadColors", colorKey: "mediumColor" },
    diskReadColorHigh: { rampKey: "diskReadColors", colorKey: "highColor" },
    diskWriteSolidColor: { rampKey: "diskWriteColors", colorKey: "solidColor" },
    diskWriteColorLow: { rampKey: "diskWriteColors", colorKey: "lowColor" },
    diskWriteColorMedium: { rampKey: "diskWriteColors", colorKey: "mediumColor" },
    diskWriteColorHigh: { rampKey: "diskWriteColors", colorKey: "highColor" },
} satisfies Record<
    AppearanceColorControlKey,
    { rampKey: AppearanceColorRampKey; colorKey: keyof ColorRamp }
>;

export function buildInspectorBindingContext(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    actionKind: SettingsContext["actionKind"];
    isWindows: boolean;
}): InspectorBindingContext {
    const context: SettingsContext = {
        actionKind: options.actionKind,
        isWindows: options.isWindows,
    };

    return {
        ...context,
        settings: options.storedSettings,
        globalSettings: options.globalSettings,
        resolved: resolveWidgetSettings({
            storedSettings: options.storedSettings,
            globalSettings: options.globalSettings,
            context,
        }),
    };
}

export function updateWidgetStoredSettings(options: {
    storedSettings: WidgetStoredSettings;
    key: PropertyInspectorSettingKey;
    value: string;
    context: InspectorBindingContext;
}): WidgetStoredSettings {
    return writeInspectorControlValue(options.storedSettings, options.key, options.value, options.context);
}

export function isPropertyInspectorSettingKey(value: string): value is PropertyInspectorSettingKey {
    return isAppearanceScalarKey(value)
        || isAppearanceColorControlKey(value)
        || isMetricKey(value)
        || isLocalKey(value)
        || isNetworkKey(value)
        || isDiskThroughputKey(value)
        || isRuntimeCacheKey(value);
}

export function readInspectorControlValue(
    context: InspectorBindingContext,
    key: PropertyInspectorSettingKey,
): InspectorControlValue {
    if (isAppearanceColorControlKey(key)) {
        const colorPath = APPEARANCE_COLOR_CONTROL_PATHS[key];
        return context.resolved.appearance[colorPath.rampKey][colorPath.colorKey];
    }

    if (isAppearanceScalarKey(key)) {
        return context.resolved.appearance[key];
    }

    if (isMetricKey(key)) {
        return context.resolved.metric[key];
    }

    if (isLocalKey(key)) {
        return toControlValue(context.resolved.local[key], key);
    }

    if (isNetworkKey(key)) {
        return toControlValue(context.resolved.network[key], key);
    }

    if (isDiskThroughputKey(key)) {
        return toControlValue(context.resolved.diskThroughput[key], key);
    }

    if (isRuntimeCacheKey(key)) {
        return context.settings.runtimeCache?.[key] ?? defaultRuntimeCache[key];
    }

    return undefined;
}

function writeInspectorControlValue(
    settings: WidgetStoredSettings,
    key: PropertyInspectorSettingKey,
    value: string,
    context: InspectorBindingContext,
): WidgetStoredSettings {
    if (key === "lowThreshold" || key === "highThreshold") {
        return writeThresholdControlValue(settings, key, value, context);
    }

    if (isAppearanceColorControlKey(key)) {
        return writeColorControlValue(settings, key, value);
    }

    if (isAppearanceScalarKey(key)) {
        return updateWidgetSettingsBranch(settings, "appearanceOverrides", {
            [key]: value,
        } as NonNullable<WidgetSettings["appearanceOverrides"]>);
    }

    if (isMetricKey(key)) {
        return updateWidgetSettingsBranch(settings, "metric", {
            [key]: value,
        } as NonNullable<WidgetSettings["metric"]>);
    }

    if (isLocalKey(key)) {
        return updateWidgetSettingsBranch(settings, "local", {
            [key]: value,
        } as NonNullable<WidgetSettings["local"]>);
    }

    if (isNetworkKey(key)) {
        return updateWidgetSettingsBranch(settings, "networkOverrides", {
            [key]: value,
            ...(isNetworkMaximumKey(key) ? { networkScaleMode: "custom" as const } : {}),
        } as NonNullable<WidgetSettings["networkOverrides"]>);
    }

    if (isDiskThroughputKey(key)) {
        return updateWidgetSettingsBranch(settings, "diskThroughputOverrides", {
            [key]: value,
            ...(isDiskThroughputMaximumKey(key) ? { diskThroughputScaleMode: "custom" as const } : {}),
        } as NonNullable<WidgetSettings["diskThroughputOverrides"]>);
    }

    return normalizeWidgetStoredSettings(settings);
}

function writeThresholdControlValue(
    settings: WidgetStoredSettings,
    key: "lowThreshold" | "highThreshold",
    value: string,
    context: InspectorBindingContext,
): WidgetStoredSettings {
    const currentLowThreshold = context.resolved.appearance.lowThreshold;
    const currentHighThreshold = context.resolved.appearance.highThreshold;
    const nextThreshold = parseThreshold(
        value,
        key === "lowThreshold" ? currentLowThreshold : currentHighThreshold,
    );
    const patch: AppearanceSettingsOverride = { [key]: nextThreshold };

    if (key === "lowThreshold" && nextThreshold > currentHighThreshold) {
        patch.highThreshold = nextThreshold;
    }

    if (key === "highThreshold" && nextThreshold < currentLowThreshold) {
        patch.lowThreshold = nextThreshold;
    }

    return updateWidgetSettingsBranch(settings, "appearanceOverrides", patch);
}

function toControlValue(value: InspectorControlValue, key: PropertyInspectorSettingKey): InspectorControlValue {
    return value === undefined && isOptionalNumberControlKey(key) ? "" : value;
}

function writeColorControlValue(
    settings: WidgetStoredSettings,
    key: AppearanceColorControlKey,
    value: string,
): WidgetStoredSettings {
    const colorPath = APPEARANCE_COLOR_CONTROL_PATHS[key];

    return updateWidgetSettingsBranch(settings, "appearanceOverrides", {
        [colorPath.rampKey]: {
            ...settings.appearanceOverrides?.[colorPath.rampKey],
            [colorPath.colorKey]: value,
        },
    });
}

function isAppearanceScalarKey(key: string): key is keyof AppearanceScalarSettings {
    return key in defaultAppearanceSettings && !isAppearanceColorRampKey(key);
}

function isAppearanceColorControlKey(key: string): key is AppearanceColorControlKey {
    return Object.hasOwn(APPEARANCE_COLOR_CONTROL_PATHS, key);
}

function isAppearanceColorRampKey(key: string): key is AppearanceColorRampKey {
    return key === "usageColors"
        || key === "downloadColors"
        || key === "uploadColors"
        || key === "diskReadColors"
        || key === "diskWriteColors";
}

function isMetricKey(key: string): key is keyof MetricSettings {
    return key in defaultMetricSettings;
}

function isLocalKey(key: string): key is keyof WidgetLocalSettings {
    return key in defaultLocalSettings;
}

function isNetworkKey(key: string): key is keyof NetworkDefaultSettings {
    return key in defaultNetworkSettings;
}

function isDiskThroughputKey(key: string): key is keyof DiskThroughputDefaultSettings {
    return key in defaultDiskThroughputSettings;
}

function isRuntimeCacheKey(key: string): key is Extract<
    keyof WidgetRuntimeCache,
    "availableNetworkInterfaces" | "availableDiskVolumes"
> {
    return key === "availableNetworkInterfaces" || key === "availableDiskVolumes";
}

function isNetworkMaximumKey(key: string): key is "maximumDownloadSpeedMbps" | "maximumUploadSpeedMbps" {
    return key === "maximumDownloadSpeedMbps" || key === "maximumUploadSpeedMbps";
}

function isDiskThroughputMaximumKey(
    key: string,
): key is "maximumDiskReadThroughputMebibytesPerSecond" | "maximumDiskWriteThroughputMebibytesPerSecond" {
    return key === "maximumDiskReadThroughputMebibytesPerSecond"
        || key === "maximumDiskWriteThroughputMebibytesPerSecond";
}

function isOptionalNumberControlKey(key: string): boolean {
    return key === "maximumGpuPowerWatts"
        || isNetworkMaximumKey(key)
        || isDiskThroughputMaximumKey(key);
}

function parseThreshold(value: string, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

import {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultRuntimeCache,
    sanitizeWidgetSettings,
    type AppearanceColorRampKey,
    type AppearanceScalarSettings,
    type AppearanceSettingsOverride,
    type DiskThroughputDefaultSettings,
    type MetricSettings,
    type NetworkDefaultSettings,
    type GlobalSettings,
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
    AppearanceColorTarget,
    InspectorControlValue,
    InspectorSettingTarget,
    PropertyInspectorSettingKey,
    VisibilityContext,
} from "./types";

export type InspectorBindingContext = VisibilityContext;

export function buildInspectorBindingContext(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: GlobalSettings;
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
    target: InspectorSettingTarget;
    value: InspectorControlValue;
    context: InspectorBindingContext;
}): WidgetStoredSettings {
    return writeInspectorControlValue(options.storedSettings, options.target, options.value, options.context);
}

export function isPropertyInspectorSettingKey(value: string): value is PropertyInspectorSettingKey {
    return isAppearanceScalarKey(value)
        || isMetricKey(value)
        || isLocalKey(value)
        || isNetworkKey(value)
        || isDiskThroughputKey(value)
        || isRuntimeCacheKey(value);
}

export function readInspectorControlValue(
    context: InspectorBindingContext,
    target: InspectorSettingTarget,
): InspectorControlValue {
    if (isAppearanceColorTarget(target)) {
        return context.resolved.appearance[target.rampKey][target.colorKey];
    }

    const key = target;

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
    target: InspectorSettingTarget,
    value: InspectorControlValue,
    context: InspectorBindingContext,
): WidgetStoredSettings {
    if (isAppearanceColorTarget(target)) {
        return writeColorControlValue(settings, target, value);
    }

    const key = target;

    if (key === "lowThreshold" || key === "highThreshold") {
        return writeThresholdControlValue(settings, key, value, context);
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

    return sanitizeWidgetSettings(settings);
}

function writeThresholdControlValue(
    settings: WidgetStoredSettings,
    key: "lowThreshold" | "highThreshold",
    value: InspectorControlValue,
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
    target: AppearanceColorTarget,
    value: InspectorControlValue,
): WidgetStoredSettings {
    return updateWidgetSettingsBranch(settings, "appearanceOverrides", {
        [target.rampKey]: {
            ...settings.appearanceOverrides?.[target.rampKey],
            [target.colorKey]: value as string,
        },
    });
}

function isAppearanceScalarKey(key: string): key is keyof AppearanceScalarSettings {
    return key in defaultAppearanceSettings && !isAppearanceColorRampKey(key);
}

function isAppearanceColorTarget(target: InspectorSettingTarget): target is AppearanceColorTarget {
    return typeof target === "object";
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

function parseThreshold(value: InspectorControlValue, fallbackValue: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(value), 0), 100);
}

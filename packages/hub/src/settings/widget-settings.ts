import { readPluginGlobalSettings, readWidgetSettings } from "./codec";
import {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultPluginGlobalSettings,
    defaultRuntimeCache,
} from "./defaults";
import type {
    ActionKind,
    AppearanceSettings,
    CircleStyle,
    DiskMetricKind,
    DiskThroughputDefaultSettings,
    DiskThroughputDirection,
    GraphicType,
    GridLineVisibility,
    MetricSettings,
    NetworkDefaultSettings,
    NetworkDirection,
    PluginGlobalSettings,
    ResolvedWidgetSettings,
    SettingsContext,
    WidgetLocalSettings,
    WidgetRuntimeCache,
    WidgetStoredSettings,
} from "./model";

export {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultPluginGlobalSettings,
    defaultRuntimeCache,
} from "./defaults";
export type {
    ActionKind,
    AppearanceSettings,
    CircleStyle,
    ColorMode,
    DiskMetricKind,
    DiskThroughputDefaultSettings,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    GlobalSettings,
    GraphicStyle,
    GraphicType,
    GridLineType,
    GridLineVisibility,
    MetricSettings,
    NetworkDefaultSettings,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    NetworkUnitBase,
    PluginGlobalSettings,
    ResolvedWidgetSettings,
    ScaleMode,
    SettingsContext,
    TemperatureUnit,
    WidgetLocalSettings,
    WidgetRuntimeCache,
    WidgetSettings,
    WidgetStoredSettings,
} from "./model";

const APPEARANCE_KEYS = new Set<keyof AppearanceSettings>([
    "graphicType",
    "circleStyle",
    "graphicStyle",
    "colorMode",
    "solidColor",
    "lowThreshold",
    "highThreshold",
    "colorLow",
    "colorMedium",
    "colorHigh",
    "lineSmoothingPercent",
    "gridLineVisibility",
    "gridLineType",
    "downloadSolidColor",
    "downloadColorLow",
    "downloadColorMedium",
    "downloadColorHigh",
    "uploadSolidColor",
    "uploadColorLow",
    "uploadColorMedium",
    "uploadColorHigh",
    "diskReadSolidColor",
    "diskReadColorLow",
    "diskReadColorMedium",
    "diskReadColorHigh",
    "diskWriteSolidColor",
    "diskWriteColorLow",
    "diskWriteColorMedium",
    "diskWriteColorHigh",
]);
const NETWORK_KEYS = new Set<keyof NetworkDefaultSettings>([
    "networkScaleMode",
    "maximumDownloadSpeedMbps",
    "maximumUploadSpeedMbps",
    "networkUnitBase",
]);
const DISK_THROUGHPUT_KEYS = new Set<keyof DiskThroughputDefaultSettings>([
    "diskThroughputScaleMode",
    "maximumDiskReadThroughputMebibytesPerSecond",
    "maximumDiskWriteThroughputMebibytesPerSecond",
]);

export function normalizePluginGlobalSettings(rawSettings: unknown): PluginGlobalSettings {
    const settings = readPluginGlobalSettings(rawSettings);
    const rawOverrideWidgetAppearance = settings.overrideWidgetAppearance as unknown;

    return {
        ...defaultPluginGlobalSettings,
        ...settings,
        overrideWidgetAppearance: rawOverrideWidgetAppearance === true
            || rawOverrideWidgetAppearance === "true",
        appearanceDefaults: normalizeAppearanceSettings(
            readRecord(settings.appearanceDefaults),
            defaultPluginGlobalSettings.appearanceDefaults,
        ),
        networkDefaults: normalizeNetworkSettings(
            readRecord(settings.networkDefaults),
            defaultPluginGlobalSettings.networkDefaults,
        ),
        diskThroughputDefaults: normalizeDiskThroughputSettings(
            readRecord(settings.diskThroughputDefaults),
            defaultPluginGlobalSettings.diskThroughputDefaults,
        ),
    };
}

export function normalizeWidgetStoredSettings(
    rawSettings: unknown,
    context: SettingsContext,
): WidgetStoredSettings {
    const settings = readWidgetSettings(rawSettings);
    const metric = normalizeMetricSettings({
        ...pickKnownFields(settings, defaultMetricSettings),
        ...readRecord(settings.metric),
    }, context);
    const local = normalizeLocalSettings({
        ...pickKnownFields(settings, defaultLocalSettings),
        diskMetricKind: metric.diskMetricKind,
        ...readRecord(settings.local),
    }, context);
    const appearanceOverrides = normalizeAppearanceOverrides({
        ...pickKnownFields(settings, defaultAppearanceSettings),
        ...readRecord(settings.appearanceOverrides),
    });
    const networkOverrides = normalizeNetworkOverrides({
        ...pickKnownFields(settings, defaultNetworkSettings),
        ...readRecord(settings.networkOverrides),
    });
    const diskThroughputOverrides = normalizeDiskThroughputOverrides({
        ...pickKnownFields(settings, defaultDiskThroughputSettings),
        ...readRecord(settings.diskThroughputOverrides),
    });
    const runtimeCache = normalizeRuntimeCache({
        ...pickKnownFields(settings, defaultRuntimeCache),
        ...readRecord(settings.runtimeCache),
    });

    return {
        metric,
        local,
        appearanceOverrides,
        networkOverrides,
        diskThroughputOverrides,
        runtimeCache,
    };
}

export function resolveWidgetSettings(options: {
    storedSettings: WidgetStoredSettings;
    globalSettings: PluginGlobalSettings;
    actionKind: ActionKind;
    isWindows: boolean;
}): ResolvedWidgetSettings {
    const context = {
        actionKind: options.actionKind,
        isWindows: options.isWindows,
    };
    const metric = normalizeMetricSettings({ ...options.storedSettings.metric }, context);
    const local = normalizeLocalSettings({ ...options.storedSettings.local }, context);
    const appearance = {
        ...defaultAppearanceSettings,
        ...options.storedSettings.appearanceOverrides,
    };
    const network = resolveNetworkSettings(options.storedSettings, options.globalSettings);
    const diskThroughput = resolveDiskThroughputSettings(options.storedSettings, options.globalSettings);

    return {
        metric,
        local,
        appearance: options.globalSettings.overrideWidgetAppearance
            ? { ...defaultAppearanceSettings, ...options.globalSettings.appearanceDefaults }
            : appearance,
        network,
        diskThroughput,
    };
}

function resolveNetworkSettings(
    storedSettings: WidgetStoredSettings,
    globalSettings: PluginGlobalSettings,
): NetworkDefaultSettings {
    const network = {
        ...defaultNetworkSettings,
        ...globalSettings.networkDefaults,
        ...storedSettings.networkOverrides,
    };

    if (network.networkScaleMode === "auto") {
        return {
            ...network,
            maximumDownloadSpeedMbps: maxOptionalPositiveNumber(
                network.maximumDownloadSpeedMbps,
                storedSettings.runtimeCache.learnedMaximumDownloadSpeedMbps,
            ),
            maximumUploadSpeedMbps: maxOptionalPositiveNumber(
                network.maximumUploadSpeedMbps,
                storedSettings.runtimeCache.learnedMaximumUploadSpeedMbps,
            ),
        };
    }

    return network;
}

function resolveDiskThroughputSettings(
    storedSettings: WidgetStoredSettings,
    globalSettings: PluginGlobalSettings,
): DiskThroughputDefaultSettings {
    const diskThroughput = {
        ...defaultDiskThroughputSettings,
        ...globalSettings.diskThroughputDefaults,
        ...storedSettings.diskThroughputOverrides,
    };

    if (diskThroughput.diskThroughputScaleMode === "auto") {
        return {
            ...diskThroughput,
            maximumDiskReadThroughputMebibytesPerSecond: maxOptionalPositiveNumber(
                diskThroughput.maximumDiskReadThroughputMebibytesPerSecond,
                storedSettings.runtimeCache.learnedMaximumDiskReadThroughputMebibytesPerSecond,
            ),
            maximumDiskWriteThroughputMebibytesPerSecond: maxOptionalPositiveNumber(
                diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond,
                storedSettings.runtimeCache.learnedMaximumDiskWriteThroughputMebibytesPerSecond,
            ),
        };
    }

    return diskThroughput;
}

function normalizeMetricSettings(rawSettings: Record<string, unknown>, context: SettingsContext): MetricSettings {
    const diskMetricKind = normalizeDiskMetricKind(rawSettings.diskMetricKind, context.isWindows);

    return {
        networkDirection: normalizeNetworkDirection(rawSettings.networkDirection),
        networkInterfaceId: normalizeString(rawSettings.networkInterfaceId, defaultMetricSettings.networkInterfaceId),
        diskMetricKind,
        diskVolumeId: normalizeString(rawSettings.diskVolumeId, defaultMetricSettings.diskVolumeId),
        diskThroughputDirection: diskMetricKind === "throughput"
            ? normalizeDiskThroughputDirection(rawSettings.diskThroughputDirection)
            : defaultMetricSettings.diskThroughputDirection,
    };
}

function normalizeLocalSettings(rawSettings: Record<string, unknown>, context: SettingsContext): WidgetLocalSettings {
    const diskMetricKind = normalizeDiskMetricKind(readRecord(rawSettings).diskMetricKind, context.isWindows);

    return {
        pollingFrequencySeconds: normalizePollingFrequency(
            rawSettings.pollingFrequencySeconds,
            resolveDefaultPollingFrequencySeconds(context, diskMetricKind),
        ),
        networkTrafficDisplayMode: rawSettings.networkTrafficDisplayMode === "overlay" ? "overlay" : "mirrored",
        diskUsageDisplayMode: rawSettings.diskUsageDisplayMode === "space" ? "space" : "percentage",
        diskLinearLabel: normalizeString(rawSettings.diskLinearLabel, defaultLocalSettings.diskLinearLabel),
        maximumTemperatureCelsius: normalizePositiveNumber(
            rawSettings.maximumTemperatureCelsius,
            defaultLocalSettings.maximumTemperatureCelsius,
        ),
        maximumGpuPowerWatts: normalizeOptionalPositiveNumber(rawSettings.maximumGpuPowerWatts),
        temperatureUnit: rawSettings.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius",
    };
}

function normalizeAppearanceSettings(
    rawSettings: Record<string, unknown>,
    fallbackSettings: AppearanceSettings,
): AppearanceSettings {
    const lowThreshold = normalizeThreshold(rawSettings.lowThreshold, fallbackSettings.lowThreshold);
    const highThreshold = normalizeThreshold(rawSettings.highThreshold, fallbackSettings.highThreshold);
    const thresholds = orderThresholds(lowThreshold, highThreshold);

    return {
        graphicType: normalizeGraphicType(rawSettings.graphicType, fallbackSettings.graphicType),
        circleStyle: normalizeCircleStyle(rawSettings.circleStyle, fallbackSettings.circleStyle),
        graphicStyle: rawSettings.graphicStyle === "cupertino-glass" ? "cupertino-glass" : fallbackSettings.graphicStyle,
        colorMode: rawSettings.colorMode === "solid" ? "solid" : rawSettings.colorMode === "threshold" ? "threshold" : fallbackSettings.colorMode,
        solidColor: normalizeHexColor(rawSettings.solidColor, fallbackSettings.solidColor),
        lowThreshold: thresholds.lowThreshold,
        highThreshold: thresholds.highThreshold,
        colorLow: normalizeHexColor(rawSettings.colorLow, fallbackSettings.colorLow),
        colorMedium: normalizeHexColor(rawSettings.colorMedium, fallbackSettings.colorMedium),
        colorHigh: normalizeHexColor(rawSettings.colorHigh, fallbackSettings.colorHigh),
        lineSmoothingPercent: normalizeThreshold(rawSettings.lineSmoothingPercent, fallbackSettings.lineSmoothingPercent),
        gridLineVisibility: normalizeGridLineVisibility(rawSettings.gridLineVisibility, fallbackSettings.gridLineVisibility),
        gridLineType: rawSettings.gridLineType === "vertical" ? "vertical" : fallbackSettings.gridLineType,
        downloadSolidColor: normalizeHexColor(rawSettings.downloadSolidColor, fallbackSettings.downloadSolidColor),
        downloadColorLow: normalizeHexColor(rawSettings.downloadColorLow, fallbackSettings.downloadColorLow),
        downloadColorMedium: normalizeHexColor(rawSettings.downloadColorMedium, fallbackSettings.downloadColorMedium),
        downloadColorHigh: normalizeHexColor(rawSettings.downloadColorHigh, fallbackSettings.downloadColorHigh),
        uploadSolidColor: normalizeHexColor(rawSettings.uploadSolidColor, fallbackSettings.uploadSolidColor),
        uploadColorLow: normalizeHexColor(rawSettings.uploadColorLow, fallbackSettings.uploadColorLow),
        uploadColorMedium: normalizeHexColor(rawSettings.uploadColorMedium, fallbackSettings.uploadColorMedium),
        uploadColorHigh: normalizeHexColor(rawSettings.uploadColorHigh, fallbackSettings.uploadColorHigh),
        diskReadSolidColor: normalizeHexColor(rawSettings.diskReadSolidColor, fallbackSettings.diskReadSolidColor),
        diskReadColorLow: normalizeHexColor(rawSettings.diskReadColorLow, fallbackSettings.diskReadColorLow),
        diskReadColorMedium: normalizeHexColor(rawSettings.diskReadColorMedium, fallbackSettings.diskReadColorMedium),
        diskReadColorHigh: normalizeHexColor(rawSettings.diskReadColorHigh, fallbackSettings.diskReadColorHigh),
        diskWriteSolidColor: normalizeHexColor(rawSettings.diskWriteSolidColor, fallbackSettings.diskWriteSolidColor),
        diskWriteColorLow: normalizeHexColor(rawSettings.diskWriteColorLow, fallbackSettings.diskWriteColorLow),
        diskWriteColorMedium: normalizeHexColor(rawSettings.diskWriteColorMedium, fallbackSettings.diskWriteColorMedium),
        diskWriteColorHigh: normalizeHexColor(rawSettings.diskWriteColorHigh, fallbackSettings.diskWriteColorHigh),
    };
}

function normalizeNetworkSettings(
    rawSettings: Record<string, unknown>,
    fallbackSettings: NetworkDefaultSettings,
): NetworkDefaultSettings {
    return {
        networkScaleMode: rawSettings.networkScaleMode === "custom" ? "custom" : fallbackSettings.networkScaleMode,
        maximumDownloadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumDownloadSpeedMbps),
        maximumUploadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumUploadSpeedMbps),
        networkUnitBase: rawSettings.networkUnitBase === "bit" ? "bit" : fallbackSettings.networkUnitBase,
    };
}

function normalizeDiskThroughputSettings(
    rawSettings: Record<string, unknown>,
    fallbackSettings: DiskThroughputDefaultSettings,
): DiskThroughputDefaultSettings {
    return {
        diskThroughputScaleMode: rawSettings.diskThroughputScaleMode === "custom"
            ? "custom"
            : fallbackSettings.diskThroughputScaleMode,
        maximumDiskReadThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskReadThroughputMebibytesPerSecond,
        ),
        maximumDiskWriteThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskWriteThroughputMebibytesPerSecond,
        ),
    };
}

function normalizeAppearanceOverrides(rawSettings: Record<string, unknown>): Partial<AppearanceSettings> {
    const normalizedSettings = normalizeAppearanceSettings(rawSettings, defaultAppearanceSettings);
    return copyPresentKeys(rawSettings, normalizedSettings, APPEARANCE_KEYS);
}

function normalizeNetworkOverrides(rawSettings: Record<string, unknown>): Partial<NetworkDefaultSettings> {
    const normalizedSettings = normalizeNetworkSettings(rawSettings, defaultNetworkSettings);
    return copyPresentKeys(rawSettings, normalizedSettings, NETWORK_KEYS);
}

function normalizeDiskThroughputOverrides(rawSettings: Record<string, unknown>): Partial<DiskThroughputDefaultSettings> {
    const normalizedSettings = normalizeDiskThroughputSettings(rawSettings, defaultDiskThroughputSettings);
    return copyPresentKeys(rawSettings, normalizedSettings, DISK_THROUGHPUT_KEYS);
}

function normalizeRuntimeCache(rawSettings: Record<string, unknown>): WidgetRuntimeCache {
    return {
        availableNetworkInterfaces: normalizeString(
            rawSettings.availableNetworkInterfaces,
            defaultRuntimeCache.availableNetworkInterfaces,
        ),
        availableDiskVolumes: normalizeString(rawSettings.availableDiskVolumes, defaultRuntimeCache.availableDiskVolumes),
        learnedMaximumDownloadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.learnedMaximumDownloadSpeedMbps),
        learnedMaximumUploadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.learnedMaximumUploadSpeedMbps),
        learnedMaximumDiskReadThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.learnedMaximumDiskReadThroughputMebibytesPerSecond,
        ),
        learnedMaximumDiskWriteThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.learnedMaximumDiskWriteThroughputMebibytesPerSecond,
        ),
    };
}

function copyPresentKeys<TSettings extends object, TKey extends keyof TSettings>(
    rawSettings: Record<string, unknown>,
    normalizedSettings: TSettings,
    keySet: ReadonlySet<TKey>,
): Partial<TSettings> {
    const output: Partial<TSettings> = {};

    for (const key of keySet) {
        if (Object.hasOwn(rawSettings, key)) {
            output[key] = normalizedSettings[key];
        }
    }

    return output;
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function pickKnownFields<TSettings extends object>(
    rawSettings: Record<string, unknown>,
    shape: TSettings,
): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(shape)) {
        if (Object.hasOwn(rawSettings, key)) {
            output[key] = rawSettings[key];
        }
    }

    return output;
}

function normalizeGraphicType(value: unknown, fallbackValue: GraphicType): GraphicType {
    if (value === "circular" || value === "text" || value === "linear" || value === "dashed-line") {
        return value;
    }

    return fallbackValue;
}

function normalizeCircleStyle(value: unknown, fallbackValue: CircleStyle): CircleStyle {
    if (value === "compact" || value === "gauge" || value === "value") {
        return value;
    }

    return fallbackValue;
}

function normalizeNetworkDirection(value: unknown): NetworkDirection {
    if (value === "download" || value === "upload") {
        return value;
    }

    return "both";
}

function normalizeDiskMetricKind(value: unknown, isWindows: boolean): DiskMetricKind {
    if (isWindows && value === "throughput") {
        return "usage";
    }

    return value === "throughput" ? "throughput" : "usage";
}

function normalizeDiskThroughputDirection(value: unknown): DiskThroughputDirection {
    if (value === "read" || value === "write" || value === "total") {
        return value;
    }

    return "both";
}

function normalizeGridLineVisibility(value: unknown, fallbackValue: GridLineVisibility): GridLineVisibility {
    if (value === "none" || value === "always" || value === "adaptive") {
        return value;
    }

    return fallbackValue;
}

function resolveDefaultPollingFrequencySeconds(context: SettingsContext, diskMetricKind: DiskMetricKind): number {
    return context.actionKind === "disk" && diskMetricKind === "usage"
        ? 60
        : defaultLocalSettings.pollingFrequencySeconds;
}

function normalizePollingFrequency(value: unknown, fallbackValue: number): number {
    const numericValue = Number(value);
    return [1, 2, 3, 5, 10, 15, 30, 60].includes(numericValue) ? numericValue : fallbackValue;
}

function normalizePositiveNumber(value: unknown, fallbackValue: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : fallbackValue;
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
    if (value === "" || value == null) {
        return undefined;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : undefined;
}

function maxOptionalPositiveNumber(
    firstValue: number | undefined,
    secondValue: number | undefined,
): number | undefined {
    if (firstValue === undefined) {
        return secondValue;
    }

    if (secondValue === undefined) {
        return firstValue;
    }

    return Math.max(firstValue, secondValue);
}

function normalizeThreshold(value: unknown, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

function orderThresholds(lowThreshold: number, highThreshold: number): {
    lowThreshold: number;
    highThreshold: number;
} {
    return lowThreshold <= highThreshold
        ? { lowThreshold, highThreshold }
        : { lowThreshold: highThreshold, highThreshold: lowThreshold };
}

function normalizeHexColor(value: unknown, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    const normalizedColor = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor.toLowerCase() : fallbackColor;
}

function normalizeString(value: unknown, fallbackValue: string): string {
    return typeof value === "string" ? value : fallbackValue;
}

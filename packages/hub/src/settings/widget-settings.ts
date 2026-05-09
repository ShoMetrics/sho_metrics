import { readPluginGlobalSettings, readWidgetSettings } from "./codec";
import {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultNetworkSettings,
    defaultPluginGlobalSettings,
    defaultRuntimeCache,
} from "./defaults";
import type {
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

const RUNTIME_CACHE_KEYS = new Set<keyof WidgetRuntimeCache>([
    "availableNetworkInterfaces",
    "availableDiskVolumes",
    "learnedMaximumDownloadSpeedMbps",
    "learnedMaximumUploadSpeedMbps",
    "learnedMaximumDiskReadThroughputMebibytesPerSecond",
    "learnedMaximumDiskWriteThroughputMebibytesPerSecond",
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
): WidgetStoredSettings {
    const settings = readWidgetSettings(rawSettings);
    const storedSettings: WidgetStoredSettings = {};
    const metric = normalizeMetricOverrides(readRecord(settings.metric));
    const local = normalizeLocalOverrides(readRecord(settings.local));
    const appearanceOverrides = normalizeAppearanceOverrides(readRecord(settings.appearanceOverrides));
    const networkOverrides = normalizeNetworkOverrides(readRecord(settings.networkOverrides));
    const diskThroughputOverrides = normalizeDiskThroughputOverrides(readRecord(settings.diskThroughputOverrides));
    const runtimeCache = normalizeRuntimeCache(readRecord(settings.runtimeCache));

    if (hasStoredValues(metric)) {
        storedSettings.metric = metric;
    }

    if (hasStoredValues(local)) {
        storedSettings.local = local;
    }

    if (hasStoredValues(appearanceOverrides)) {
        storedSettings.appearanceOverrides = appearanceOverrides;
    }

    if (hasStoredValues(networkOverrides)) {
        storedSettings.networkOverrides = networkOverrides;
    }

    if (hasStoredValues(diskThroughputOverrides)) {
        storedSettings.diskThroughputOverrides = diskThroughputOverrides;
    }

    if (hasStoredValues(runtimeCache)) {
        storedSettings.runtimeCache = runtimeCache;
    }

    return storedSettings;
}

function normalizeMetricOverrides(rawSettings: Record<string, unknown>): Partial<MetricSettings> {
    const output: Partial<MetricSettings> = {};
    const networkDirection = normalizeOptionalNetworkDirection(rawSettings.networkDirection);
    const diskMetricKind = normalizeOptionalDiskMetricKind(rawSettings.diskMetricKind);
    const diskThroughputDirection = normalizeOptionalDiskThroughputDirection(rawSettings.diskThroughputDirection);

    if (networkDirection) {
        output.networkDirection = networkDirection;
    }

    if (typeof rawSettings.networkInterfaceId === "string") {
        output.networkInterfaceId = rawSettings.networkInterfaceId;
    }

    if (diskMetricKind) {
        output.diskMetricKind = diskMetricKind;
    }

    if (typeof rawSettings.diskVolumeId === "string") {
        output.diskVolumeId = rawSettings.diskVolumeId;
    }

    if (diskThroughputDirection) {
        output.diskThroughputDirection = diskThroughputDirection;
    }

    return output;
}

function normalizeLocalOverrides(rawSettings: Record<string, unknown>): Partial<WidgetLocalSettings> {
    const output: Partial<WidgetLocalSettings> = {};
    const pollingFrequencySeconds = normalizeOptionalPollingFrequency(rawSettings.pollingFrequencySeconds);
    const maximumTemperatureCelsius = normalizeOptionalPositiveNumber(rawSettings.maximumTemperatureCelsius);
    const maximumGpuPowerWatts = normalizeOptionalPositiveNumber(rawSettings.maximumGpuPowerWatts);

    if (pollingFrequencySeconds !== undefined) {
        output.pollingFrequencySeconds = pollingFrequencySeconds;
    }

    if (rawSettings.networkTrafficDisplayMode === "overlay" || rawSettings.networkTrafficDisplayMode === "mirrored") {
        output.networkTrafficDisplayMode = rawSettings.networkTrafficDisplayMode;
    }

    if (rawSettings.diskUsageDisplayMode === "space" || rawSettings.diskUsageDisplayMode === "percentage") {
        output.diskUsageDisplayMode = rawSettings.diskUsageDisplayMode;
    }

    if (typeof rawSettings.diskLinearLabel === "string") {
        output.diskLinearLabel = rawSettings.diskLinearLabel;
    }

    if (maximumTemperatureCelsius !== undefined) {
        output.maximumTemperatureCelsius = maximumTemperatureCelsius;
    }

    if (maximumGpuPowerWatts !== undefined) {
        output.maximumGpuPowerWatts = maximumGpuPowerWatts;
    }

    if (rawSettings.temperatureUnit === "fahrenheit" || rawSettings.temperatureUnit === "celsius") {
        output.temperatureUnit = rawSettings.temperatureUnit;
    }

    return output;
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

function normalizeRuntimeCache(rawSettings: Record<string, unknown>): Partial<WidgetRuntimeCache> {
    const normalizedSettings: WidgetRuntimeCache = {
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

    return copyPresentKeys(rawSettings, normalizedSettings, RUNTIME_CACHE_KEYS);
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

function hasStoredValues(settings: object): boolean {
    return Object.keys(settings).length > 0;
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

function normalizeOptionalNetworkDirection(value: unknown): NetworkDirection | undefined {
    if (value === "both" || value === "download" || value === "upload") {
        return value;
    }

    return undefined;
}

function normalizeOptionalDiskMetricKind(value: unknown): DiskMetricKind | undefined {
    return value === "usage" || value === "throughput" ? value : undefined;
}

function normalizeOptionalDiskThroughputDirection(value: unknown): DiskThroughputDirection | undefined {
    if (value === "both" || value === "read" || value === "write" || value === "total") {
        return value;
    }

    return undefined;
}

function normalizeGridLineVisibility(value: unknown, fallbackValue: GridLineVisibility): GridLineVisibility {
    if (value === "none" || value === "always" || value === "adaptive") {
        return value;
    }

    return fallbackValue;
}

function normalizeOptionalPollingFrequency(value: unknown): number | undefined {
    const numericValue = Number(value);
    return [1, 2, 3, 5, 10, 15, 30, 60].includes(numericValue) ? numericValue : undefined;
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
    if (value === "" || value == null) {
        return undefined;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : undefined;
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

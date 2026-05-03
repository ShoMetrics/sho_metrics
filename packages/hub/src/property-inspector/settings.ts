export type SettingValue = string | number | boolean | null | undefined;

export type ActionKind =
    | "cpu-usage"
    | "net-speed"
    | "ram"
    | "disk"
    | "gpu-usage"
    | "gpu-temp"
    | "gpu-vram"
    | "gpu-power"
    | "unknown";

export type GraphicType = "circular" | "linear" | "dashed-line";
export type GraphicStyle = "flat" | "cupertino-glass";
export type ColorMode = "threshold" | "solid";
export type NetworkDirection = "download" | "upload";
export type NetworkUnitBase = "byte" | "bit";
export type DiskMetricKind = "usage" | "throughput";
export type DiskUsageDisplayMode = "percentage" | "space";
export type DiskThroughputDirection = "total" | "read" | "write";
export type TemperatureUnit = "celsius" | "fahrenheit";

export interface PropertyInspectorSettings {
    pollingFrequencySeconds: number;
    graphicType: GraphicType;
    circularCenterContent: "value" | "icon";
    graphicStyle: GraphicStyle;
    colorMode: ColorMode;
    solidColor: string;
    lowThreshold: number;
    highThreshold: number;
    colorLow: string;
    colorMedium: string;
    colorHigh: string;
    networkDirection: NetworkDirection;
    networkInterfaceId: string;
    availableNetworkInterfaces: string;
    maximumNetworkSpeedMbps: number | "";
    networkUnitBase: NetworkUnitBase;
    downloadIconColor: string;
    uploadIconColor: string;
    netSpeedDefaultsApplied: boolean;
    diskMetricKind: DiskMetricKind;
    diskUsageDisplayMode: DiskUsageDisplayMode;
    diskThroughputDirection: DiskThroughputDirection;
    diskVolumeId: string;
    availableDiskVolumes: string;
    diskLinearLabel: string;
    maximumDiskThroughputMebibytesPerSecond: number;
    diskDefaultsApplied: boolean;
    maximumTemperatureCelsius: number;
    maximumGpuPowerWatts: number | "";
    temperatureUnit: TemperatureUnit;
    [key: string]: SettingValue;
}

export interface NormalizeSettingsContext {
    actionKind: ActionKind;
    isWindows: boolean;
}

export const basePropertyInspectorSettings: PropertyInspectorSettings = {
    colorMode: "threshold",
    pollingFrequencySeconds: 1,
    graphicType: "circular",
    circularCenterContent: "value",
    graphicStyle: "flat",
    solidColor: "#3b82f6",
    networkDirection: "download",
    networkInterfaceId: "",
    availableNetworkInterfaces: "[]",
    maximumNetworkSpeedMbps: "",
    networkUnitBase: "byte",
    downloadIconColor: "#3b82f6",
    uploadIconColor: "#ef4444",
    netSpeedDefaultsApplied: false,
    diskMetricKind: "usage",
    diskUsageDisplayMode: "percentage",
    diskThroughputDirection: "total",
    diskVolumeId: "",
    availableDiskVolumes: "[]",
    diskLinearLabel: "",
    maximumDiskThroughputMebibytesPerSecond: 1000,
    diskDefaultsApplied: false,
    maximumTemperatureCelsius: 100,
    maximumGpuPowerWatts: "",
    temperatureUnit: "celsius",
    lowThreshold: 30,
    highThreshold: 70,
    colorLow: "#22c55e",
    colorMedium: "#eab308",
    colorHigh: "#ef4444",
};

const pollingFrequencyValues = [1, 2, 3, 5, 10, 15, 30, 60] as const;

export function normalizePropertyInspectorSettings(
    rawSettings: Record<string, SettingValue>,
    context: NormalizeSettingsContext,
): PropertyInspectorSettings {
    const shouldApplyNetSpeedDefaults = context.actionKind === "net-speed"
        && rawSettings.netSpeedDefaultsApplied !== true;
    const shouldApplyDiskDefaults = context.actionKind === "disk"
        && rawSettings.diskDefaultsApplied !== true;
    const networkDirection = normalizeNetworkDirection(rawSettings.networkDirection);
    const diskMetricKind = normalizeDiskMetricKind(rawSettings.diskMetricKind, context.isWindows);

    return {
        ...basePropertyInspectorSettings,
        ...rawSettings,
        pollingFrequencySeconds: shouldApplyDiskDefaults
            || (context.actionKind === "disk" && rawSettings.pollingFrequencySeconds == null)
            ? resolveDefaultDiskPollingFrequency(diskMetricKind)
            : normalizePollingFrequency(rawSettings.pollingFrequencySeconds),
        graphicType: normalizeGraphicType(rawSettings.graphicType),
        circularCenterContent: rawSettings.circularCenterContent === "icon" ? "icon" : "value",
        graphicStyle: rawSettings.graphicStyle === "cupertino-glass" ? "cupertino-glass" : "flat",
        networkDirection,
        networkInterfaceId: normalizeString(rawSettings.networkInterfaceId, basePropertyInspectorSettings.networkInterfaceId),
        availableNetworkInterfaces: normalizeString(
            rawSettings.availableNetworkInterfaces,
            basePropertyInspectorSettings.availableNetworkInterfaces,
        ),
        maximumNetworkSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumNetworkSpeedMbps),
        networkUnitBase: rawSettings.networkUnitBase === "bit" ? "bit" : "byte",
        maximumTemperatureCelsius: normalizePositiveNumber(
            rawSettings.maximumTemperatureCelsius,
            basePropertyInspectorSettings.maximumTemperatureCelsius,
        ),
        maximumGpuPowerWatts: normalizeOptionalPositiveNumber(rawSettings.maximumGpuPowerWatts),
        temperatureUnit: normalizeTemperatureUnit(rawSettings.temperatureUnit),
        diskMetricKind,
        diskUsageDisplayMode: normalizeDiskUsageDisplayMode(rawSettings.diskUsageDisplayMode),
        diskThroughputDirection: normalizeDiskThroughputDirection(rawSettings.diskThroughputDirection),
        diskVolumeId: normalizeString(rawSettings.diskVolumeId, basePropertyInspectorSettings.diskVolumeId),
        availableDiskVolumes: normalizeString(
            rawSettings.availableDiskVolumes,
            basePropertyInspectorSettings.availableDiskVolumes,
        ),
        diskLinearLabel: normalizeString(rawSettings.diskLinearLabel, basePropertyInspectorSettings.diskLinearLabel),
        maximumDiskThroughputMebibytesPerSecond: normalizePositiveNumber(
            rawSettings.maximumDiskThroughputMebibytesPerSecond ?? rawSettings.maximumDiskThroughputMbps,
            basePropertyInspectorSettings.maximumDiskThroughputMebibytesPerSecond,
        ),
        downloadIconColor: normalizeHexColor(rawSettings.downloadIconColor, basePropertyInspectorSettings.downloadIconColor),
        uploadIconColor: normalizeHexColor(rawSettings.uploadIconColor, basePropertyInspectorSettings.uploadIconColor),
        colorMode: shouldApplyNetSpeedDefaults ? "solid" : normalizeColorMode(rawSettings.colorMode, context.actionKind),
        solidColor: shouldApplyNetSpeedDefaults
            ? resolveDefaultSolidColor(networkDirection)
            : normalizeHexColor(rawSettings.solidColor, resolveDefaultSolidColor(networkDirection)),
        netSpeedDefaultsApplied: context.actionKind === "net-speed"
            ? true
            : rawSettings.netSpeedDefaultsApplied === true,
        diskDefaultsApplied: context.actionKind === "disk"
            ? true
            : rawSettings.diskDefaultsApplied === true,
        lowThreshold: normalizeThreshold(rawSettings.lowThreshold, basePropertyInspectorSettings.lowThreshold),
        highThreshold: normalizeThreshold(rawSettings.highThreshold, basePropertyInspectorSettings.highThreshold),
        colorLow: normalizeHexColor(rawSettings.colorLow, basePropertyInspectorSettings.colorLow),
        colorMedium: normalizeHexColor(
            rawSettings.colorMedium ?? rawSettings.colorMid,
            basePropertyInspectorSettings.colorMedium,
        ),
        colorHigh: normalizeHexColor(rawSettings.colorHigh, basePropertyInspectorSettings.colorHigh),
    };
}

export function normalizeThreshold(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

export function normalizePositiveNumber(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return Math.round(numericValue);
}

export function normalizeOptionalPositiveNumber(value: SettingValue): number | "" {
    if (value === "" || value == null) {
        return "";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return "";
    }

    return Math.round(numericValue);
}

export function normalizePollingFrequency(value: SettingValue): number {
    const numericValue = Number(value);

    return pollingFrequencyValues.includes(numericValue as typeof pollingFrequencyValues[number])
        ? numericValue
        : basePropertyInspectorSettings.pollingFrequencySeconds;
}

export function normalizeDiskMetricKind(value: SettingValue, isWindows: boolean): DiskMetricKind {
    if (isWindows && value === "throughput") {
        return "usage";
    }

    return value === "throughput" ? "throughput" : "usage";
}

export function normalizeDiskUsageDisplayMode(value: SettingValue): DiskUsageDisplayMode {
    return value === "space" ? "space" : "percentage";
}

export function normalizeDiskThroughputDirection(value: SettingValue): DiskThroughputDirection {
    if (value === "read" || value === "write") {
        return value;
    }

    return "total";
}

export function normalizeNetworkDirection(value: SettingValue): NetworkDirection {
    return value === "upload" ? "upload" : "download";
}

export function normalizeTemperatureUnit(value: SettingValue): TemperatureUnit {
    return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function resolveDefaultDiskPollingFrequency(diskMetricKind: DiskMetricKind): number {
    return diskMetricKind === "throughput" ? 1 : 60;
}

export function resolveDefaultSolidColor(networkDirection: SettingValue): string {
    return normalizeNetworkDirection(networkDirection) === "upload"
        ? basePropertyInspectorSettings.uploadIconColor
        : basePropertyInspectorSettings.downloadIconColor;
}

export function resolveActionKind(actionUuid: string): ActionKind {
    const actionSuffix = actionUuid.split(".").pop();

    if (
        actionSuffix === "cpu-usage"
        || actionSuffix === "net-speed"
        || actionSuffix === "ram"
        || actionSuffix === "disk"
        || actionSuffix === "gpu-usage"
        || actionSuffix === "gpu-temp"
        || actionSuffix === "gpu-vram"
        || actionSuffix === "gpu-power"
    ) {
        return actionSuffix;
    }

    return "unknown";
}

function normalizeGraphicType(value: SettingValue): GraphicType {
    if (value === "linear" || value === "dashed-line") {
        return value;
    }

    return "circular";
}

function normalizeColorMode(value: SettingValue, actionKind: ActionKind): ColorMode {
    if (value === "solid") {
        return "solid";
    }

    return actionKind === "net-speed" ? "solid" : "threshold";
}

function normalizeHexColor(value: SettingValue, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function normalizeString(value: SettingValue, fallbackValue: string): string {
    return typeof value === "string" ? value : fallbackValue;
}

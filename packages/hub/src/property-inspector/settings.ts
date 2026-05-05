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
export type NetworkDirection = "both" | "download" | "upload";
export type NetworkTrafficDisplayMode = "overlay" | "mirrored";
export type NetworkUnitBase = "byte" | "bit";
export type DiskMetricKind = "usage" | "throughput";
export type DiskUsageDisplayMode = "percentage" | "space";
export type DiskThroughputDirection = "both" | "total" | "read" | "write";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type GridLineVisibility = "adaptive" | "always" | "none";
export type GridLineType = "horizontal" | "vertical";

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
    lineSmoothingPercent: number;
    gridLineVisibility: GridLineVisibility;
    gridLineType: GridLineType;
    networkDirection: NetworkDirection;
    networkTrafficDisplayMode: NetworkTrafficDisplayMode;
    networkInterfaceId: string;
    availableNetworkInterfaces: string;
    maximumNetworkSpeedMbps: number | "";
    networkUnitBase: NetworkUnitBase;
    downloadColorMode: ColorMode;
    downloadSolidColor: string;
    downloadColorLow: string;
    downloadColorMedium: string;
    downloadColorHigh: string;
    uploadColorMode: ColorMode;
    uploadSolidColor: string;
    uploadColorLow: string;
    uploadColorMedium: string;
    uploadColorHigh: string;
    netSpeedDefaultsApplied: boolean;
    diskMetricKind: DiskMetricKind;
    diskUsageDisplayMode: DiskUsageDisplayMode;
    diskThroughputDirection: DiskThroughputDirection;
    diskVolumeId: string;
    availableDiskVolumes: string;
    diskLinearLabel: string;
    maximumDiskThroughputMebibytesPerSecond: number;
    diskReadColorMode: ColorMode;
    diskReadSolidColor: string;
    diskReadColorLow: string;
    diskReadColorMedium: string;
    diskReadColorHigh: string;
    diskWriteColorMode: ColorMode;
    diskWriteSolidColor: string;
    diskWriteColorLow: string;
    diskWriteColorMedium: string;
    diskWriteColorHigh: string;
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
    networkDirection: "both",
    networkTrafficDisplayMode: "mirrored",
    networkInterfaceId: "",
    availableNetworkInterfaces: "[]",
    maximumNetworkSpeedMbps: "",
    networkUnitBase: "byte",
    downloadColorMode: "solid",
    downloadSolidColor: "#3b82f6",
    downloadColorLow: "#22c55e",
    downloadColorMedium: "#3b82f6",
    downloadColorHigh: "#60a5fa",
    uploadColorMode: "solid",
    uploadSolidColor: "#ef4444",
    uploadColorLow: "#f97316",
    uploadColorMedium: "#ef4444",
    uploadColorHigh: "#f472b6",
    netSpeedDefaultsApplied: false,
    diskMetricKind: "usage",
    diskUsageDisplayMode: "percentage",
    diskThroughputDirection: "both",
    diskVolumeId: "",
    availableDiskVolumes: "[]",
    diskLinearLabel: "",
    maximumDiskThroughputMebibytesPerSecond: 1000,
    diskReadColorMode: "solid",
    diskReadSolidColor: "#38bdf8",
    diskReadColorLow: "#22c55e",
    diskReadColorMedium: "#38bdf8",
    diskReadColorHigh: "#60a5fa",
    diskWriteColorMode: "solid",
    diskWriteSolidColor: "#f472b6",
    diskWriteColorLow: "#f97316",
    diskWriteColorMedium: "#f472b6",
    diskWriteColorHigh: "#fb7185",
    diskDefaultsApplied: false,
    maximumTemperatureCelsius: 100,
    maximumGpuPowerWatts: "",
    temperatureUnit: "celsius",
    lowThreshold: 30,
    highThreshold: 70,
    colorLow: "#22c55e",
    colorMedium: "#eab308",
    colorHigh: "#ef4444",
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
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
        networkTrafficDisplayMode: normalizeNetworkTrafficDisplayMode(rawSettings.networkTrafficDisplayMode),
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
        downloadColorMode: normalizeChannelColorMode(rawSettings.downloadColorMode),
        downloadSolidColor: normalizeHexColor(rawSettings.downloadSolidColor, basePropertyInspectorSettings.downloadSolidColor),
        downloadColorLow: normalizeHexColor(rawSettings.downloadColorLow, basePropertyInspectorSettings.downloadColorLow),
        downloadColorMedium: normalizeHexColor(rawSettings.downloadColorMedium, basePropertyInspectorSettings.downloadColorMedium),
        downloadColorHigh: normalizeHexColor(rawSettings.downloadColorHigh, basePropertyInspectorSettings.downloadColorHigh),
        uploadColorMode: normalizeChannelColorMode(rawSettings.uploadColorMode),
        uploadSolidColor: normalizeHexColor(rawSettings.uploadSolidColor, basePropertyInspectorSettings.uploadSolidColor),
        uploadColorLow: normalizeHexColor(rawSettings.uploadColorLow, basePropertyInspectorSettings.uploadColorLow),
        uploadColorMedium: normalizeHexColor(rawSettings.uploadColorMedium, basePropertyInspectorSettings.uploadColorMedium),
        uploadColorHigh: normalizeHexColor(rawSettings.uploadColorHigh, basePropertyInspectorSettings.uploadColorHigh),
        diskReadColorMode: normalizeChannelColorMode(rawSettings.diskReadColorMode),
        diskReadSolidColor: normalizeHexColor(rawSettings.diskReadSolidColor, basePropertyInspectorSettings.diskReadSolidColor),
        diskReadColorLow: normalizeHexColor(rawSettings.diskReadColorLow, basePropertyInspectorSettings.diskReadColorLow),
        diskReadColorMedium: normalizeHexColor(rawSettings.diskReadColorMedium, basePropertyInspectorSettings.diskReadColorMedium),
        diskReadColorHigh: normalizeHexColor(rawSettings.diskReadColorHigh, basePropertyInspectorSettings.diskReadColorHigh),
        diskWriteColorMode: normalizeChannelColorMode(rawSettings.diskWriteColorMode),
        diskWriteSolidColor: normalizeHexColor(rawSettings.diskWriteSolidColor, basePropertyInspectorSettings.diskWriteSolidColor),
        diskWriteColorLow: normalizeHexColor(rawSettings.diskWriteColorLow, basePropertyInspectorSettings.diskWriteColorLow),
        diskWriteColorMedium: normalizeHexColor(rawSettings.diskWriteColorMedium, basePropertyInspectorSettings.diskWriteColorMedium),
        diskWriteColorHigh: normalizeHexColor(rawSettings.diskWriteColorHigh, basePropertyInspectorSettings.diskWriteColorHigh),
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
        lineSmoothingPercent: normalizeThreshold(
            rawSettings.lineSmoothingPercent,
            basePropertyInspectorSettings.lineSmoothingPercent,
        ),
        gridLineVisibility: normalizeGridLineVisibility(rawSettings.gridLineVisibility),
        gridLineType: normalizeGridLineType(rawSettings.gridLineType),
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
    if (value === "both") {
        return "both";
    }

    if (value === "read" || value === "write" || value === "total") {
        return value;
    }

    return "both";
}

export function normalizeNetworkDirection(value: SettingValue): NetworkDirection {
    if (value === "both") {
        return "both";
    }

    if (value === "download" || value === "upload") {
        return value;
    }

    return "both";
}

export function normalizeNetworkTrafficDisplayMode(value: SettingValue): NetworkTrafficDisplayMode {
    return value === "overlay" ? "overlay" : "mirrored";
}

export function normalizeTemperatureUnit(value: SettingValue): TemperatureUnit {
    return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function normalizeGridLineVisibility(value: SettingValue): GridLineVisibility {
    if (value === "none") {
        return "none";
    }

    if (value === "always") {
        return "always";
    }

    return "adaptive";
}

export function normalizeGridLineType(value: SettingValue): GridLineType {
    return value === "vertical" ? "vertical" : "horizontal";
}

export function resolveDefaultDiskPollingFrequency(diskMetricKind: DiskMetricKind): number {
    return diskMetricKind === "throughput" ? 1 : 60;
}

export function resolveDefaultSolidColor(networkDirection: SettingValue): string {
    return normalizeNetworkDirection(networkDirection) === "upload"
        ? basePropertyInspectorSettings.uploadSolidColor
        : basePropertyInspectorSettings.downloadSolidColor;
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

function normalizeChannelColorMode(value: SettingValue): ColorMode {
    return value === "threshold" ? "threshold" : "solid";
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

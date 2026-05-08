export type ControlSettingValue = string | number | boolean | null | undefined;

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

export type GraphicType = "circular" | "text" | "linear" | "dashed-line";
export type CircleStyle = "value" | "compact" | "gauge";
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
export type ScaleMode = "auto" | "custom";

export interface PropertyInspectorSettings {
    pollingFrequencySeconds: number;
    graphicType: GraphicType;
    circleStyle: CircleStyle;
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
    networkScaleMode: ScaleMode;
    maximumDownloadSpeedMbps: number | "";
    maximumUploadSpeedMbps: number | "";
    networkUnitBase: NetworkUnitBase;
    downloadSolidColor: string;
    downloadColorLow: string;
    downloadColorMedium: string;
    downloadColorHigh: string;
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
    diskThroughputScaleMode: ScaleMode;
    maximumDiskReadThroughputMebibytesPerSecond: number | "";
    maximumDiskWriteThroughputMebibytesPerSecond: number | "";
    diskReadSolidColor: string;
    diskReadColorLow: string;
    diskReadColorMedium: string;
    diskReadColorHigh: string;
    diskWriteSolidColor: string;
    diskWriteColorLow: string;
    diskWriteColorMedium: string;
    diskWriteColorHigh: string;
    diskDefaultsApplied: boolean;
    maximumTemperatureCelsius: number;
    maximumGpuPowerWatts: number | "";
    temperatureUnit: TemperatureUnit;
    [key: string]: ControlSettingValue;
}

export interface NormalizeSettingsContext {
    actionKind: ActionKind;
    isWindows: boolean;
}

export const basePropertyInspectorSettings: PropertyInspectorSettings = {
    colorMode: "threshold",
    pollingFrequencySeconds: 1,
    graphicType: "circular",
    circleStyle: "value",
    graphicStyle: "flat",
    solidColor: "#3b82f6",
    networkDirection: "both",
    networkTrafficDisplayMode: "mirrored",
    networkInterfaceId: "",
    availableNetworkInterfaces: "[]",
    networkScaleMode: "auto",
    maximumDownloadSpeedMbps: "",
    maximumUploadSpeedMbps: "",
    networkUnitBase: "byte",
    downloadSolidColor: "#3b82f6",
    downloadColorLow: "#22c55e",
    downloadColorMedium: "#3b82f6",
    downloadColorHigh: "#60a5fa",
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
    diskThroughputScaleMode: "auto",
    maximumDiskReadThroughputMebibytesPerSecond: "",
    maximumDiskWriteThroughputMebibytesPerSecond: "",
    diskReadSolidColor: "#38bdf8",
    diskReadColorLow: "#22c55e",
    diskReadColorMedium: "#38bdf8",
    diskReadColorHigh: "#60a5fa",
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
    rawSettings: Record<string, ControlSettingValue>,
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
        circleStyle: normalizeCircleStyle(rawSettings.circleStyle),
        graphicStyle: rawSettings.graphicStyle === "cupertino-glass" ? "cupertino-glass" : "flat",
        networkDirection,
        networkTrafficDisplayMode: normalizeNetworkTrafficDisplayMode(rawSettings.networkTrafficDisplayMode),
        networkInterfaceId: normalizeString(rawSettings.networkInterfaceId, basePropertyInspectorSettings.networkInterfaceId),
        availableNetworkInterfaces: normalizeString(
            rawSettings.availableNetworkInterfaces,
            basePropertyInspectorSettings.availableNetworkInterfaces,
        ),
        networkScaleMode: normalizeScaleMode(rawSettings.networkScaleMode),
        maximumDownloadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumDownloadSpeedMbps),
        maximumUploadSpeedMbps: normalizeOptionalPositiveNumber(rawSettings.maximumUploadSpeedMbps),
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
        diskThroughputScaleMode: normalizeScaleMode(rawSettings.diskThroughputScaleMode),
        maximumDiskReadThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskReadThroughputMebibytesPerSecond,
        ),
        maximumDiskWriteThroughputMebibytesPerSecond: normalizeOptionalPositiveNumber(
            rawSettings.maximumDiskWriteThroughputMebibytesPerSecond,
        ),
        downloadSolidColor: normalizeHexColor(rawSettings.downloadSolidColor, basePropertyInspectorSettings.downloadSolidColor),
        downloadColorLow: normalizeHexColor(rawSettings.downloadColorLow, basePropertyInspectorSettings.downloadColorLow),
        downloadColorMedium: normalizeHexColor(rawSettings.downloadColorMedium, basePropertyInspectorSettings.downloadColorMedium),
        downloadColorHigh: normalizeHexColor(rawSettings.downloadColorHigh, basePropertyInspectorSettings.downloadColorHigh),
        uploadSolidColor: normalizeHexColor(rawSettings.uploadSolidColor, basePropertyInspectorSettings.uploadSolidColor),
        uploadColorLow: normalizeHexColor(rawSettings.uploadColorLow, basePropertyInspectorSettings.uploadColorLow),
        uploadColorMedium: normalizeHexColor(rawSettings.uploadColorMedium, basePropertyInspectorSettings.uploadColorMedium),
        uploadColorHigh: normalizeHexColor(rawSettings.uploadColorHigh, basePropertyInspectorSettings.uploadColorHigh),
        diskReadSolidColor: normalizeHexColor(rawSettings.diskReadSolidColor, basePropertyInspectorSettings.diskReadSolidColor),
        diskReadColorLow: normalizeHexColor(rawSettings.diskReadColorLow, basePropertyInspectorSettings.diskReadColorLow),
        diskReadColorMedium: normalizeHexColor(rawSettings.diskReadColorMedium, basePropertyInspectorSettings.diskReadColorMedium),
        diskReadColorHigh: normalizeHexColor(rawSettings.diskReadColorHigh, basePropertyInspectorSettings.diskReadColorHigh),
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
        colorMedium: normalizeHexColor(rawSettings.colorMedium, basePropertyInspectorSettings.colorMedium),
        colorHigh: normalizeHexColor(rawSettings.colorHigh, basePropertyInspectorSettings.colorHigh),
        lineSmoothingPercent: normalizeThreshold(
            rawSettings.lineSmoothingPercent,
            basePropertyInspectorSettings.lineSmoothingPercent,
        ),
        gridLineVisibility: normalizeGridLineVisibility(rawSettings.gridLineVisibility),
        gridLineType: normalizeGridLineType(rawSettings.gridLineType),
    };
}

export function normalizeThreshold(value: ControlSettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(Math.round(numericValue), 0), 100);
}

export function normalizePositiveNumber(value: ControlSettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return Math.round(numericValue);
}

export function normalizeOptionalPositiveNumber(value: ControlSettingValue): number | "" {
    if (value === "" || value == null) {
        return "";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return "";
    }

    return Math.round(numericValue);
}

export function normalizePollingFrequency(value: ControlSettingValue): number {
    const numericValue = Number(value);

    return pollingFrequencyValues.includes(numericValue as typeof pollingFrequencyValues[number])
        ? numericValue
        : basePropertyInspectorSettings.pollingFrequencySeconds;
}

export function normalizeDiskMetricKind(value: ControlSettingValue, isWindows: boolean): DiskMetricKind {
    if (isWindows && value === "throughput") {
        return "usage";
    }

    return value === "throughput" ? "throughput" : "usage";
}

export function normalizeDiskUsageDisplayMode(value: ControlSettingValue): DiskUsageDisplayMode {
    return value === "space" ? "space" : "percentage";
}

export function normalizeDiskThroughputDirection(value: ControlSettingValue): DiskThroughputDirection {
    if (value === "both") {
        return "both";
    }

    if (value === "read" || value === "write" || value === "total") {
        return value;
    }

    return "both";
}

export function normalizeNetworkDirection(value: ControlSettingValue): NetworkDirection {
    if (value === "both") {
        return "both";
    }

    if (value === "download" || value === "upload") {
        return value;
    }

    return "both";
}

export function normalizeNetworkTrafficDisplayMode(value: ControlSettingValue): NetworkTrafficDisplayMode {
    return value === "overlay" ? "overlay" : "mirrored";
}

export function normalizeTemperatureUnit(value: ControlSettingValue): TemperatureUnit {
    return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function normalizeScaleMode(value: ControlSettingValue): ScaleMode {
    return value === "custom" ? "custom" : "auto";
}

export function normalizeGridLineVisibility(value: ControlSettingValue): GridLineVisibility {
    if (value === "none") {
        return "none";
    }

    if (value === "always") {
        return "always";
    }

    return "adaptive";
}

export function normalizeGridLineType(value: ControlSettingValue): GridLineType {
    return value === "vertical" ? "vertical" : "horizontal";
}

export function resolveDefaultDiskPollingFrequency(diskMetricKind: DiskMetricKind): number {
    return diskMetricKind === "throughput" ? 1 : 60;
}

export function resolveDefaultSolidColor(networkDirection: ControlSettingValue): string {
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

function normalizeGraphicType(value: ControlSettingValue): GraphicType {
    if (value === "text" || value === "linear" || value === "dashed-line") {
        return value;
    }

    return "circular";
}

function normalizeCircleStyle(value: ControlSettingValue): CircleStyle {
    if (value === "compact" || value === "gauge") {
        return value;
    }

    return "value";
}

function normalizeColorMode(value: ControlSettingValue, actionKind: ActionKind): ColorMode {
    if (value === "threshold") {
        return "threshold";
    }

    if (value === "solid") {
        return "solid";
    }

    return actionKind === "net-speed" ? "solid" : "threshold";
}

function normalizeHexColor(value: ControlSettingValue, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackColor;
}

function normalizeString(value: ControlSettingValue, fallbackValue: string): string {
    return typeof value === "string" ? value : fallbackValue;
}

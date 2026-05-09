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
export type GridLineVisibility = "adaptive" | "always" | "none";
export type GridLineType = "horizontal" | "vertical";
export type NetworkDirection = "both" | "download" | "upload";
export type NetworkTrafficDisplayMode = "overlay" | "mirrored";
export type NetworkUnitBase = "byte" | "bit";
export type ScaleMode = "auto" | "custom";
export type DiskMetricKind = "usage" | "throughput";
export type DiskUsageDisplayMode = "percentage" | "space";
export type DiskThroughputDirection = "both" | "total" | "read" | "write";
export type TemperatureUnit = "celsius" | "fahrenheit";

export interface AppearanceSettings {
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
    downloadSolidColor: string;
    downloadColorLow: string;
    downloadColorMedium: string;
    downloadColorHigh: string;
    uploadSolidColor: string;
    uploadColorLow: string;
    uploadColorMedium: string;
    uploadColorHigh: string;
    diskReadSolidColor: string;
    diskReadColorLow: string;
    diskReadColorMedium: string;
    diskReadColorHigh: string;
    diskWriteSolidColor: string;
    diskWriteColorLow: string;
    diskWriteColorMedium: string;
    diskWriteColorHigh: string;
}

export interface NetworkDefaultSettings {
    networkScaleMode: ScaleMode;
    maximumDownloadSpeedMbps: number | undefined;
    maximumUploadSpeedMbps: number | undefined;
    networkUnitBase: NetworkUnitBase;
}

export interface DiskThroughputDefaultSettings {
    diskThroughputScaleMode: ScaleMode;
    maximumDiskReadThroughputMebibytesPerSecond: number | undefined;
    maximumDiskWriteThroughputMebibytesPerSecond: number | undefined;
}

export interface MetricSettings {
    /**
     * Required per-widget identity/source settings. This is intentionally
     * complete rather than sparse: every widget must know what it displays.
     */
    networkDirection: NetworkDirection;
    networkInterfaceId: string;
    diskMetricKind: DiskMetricKind;
    diskVolumeId: string;
    diskThroughputDirection: DiskThroughputDirection;
}

export interface WidgetLocalSettings {
    /**
     * Local settings are per-widget behavior/content choices, not plugin-level
     * style defaults. They do not participate in global cascade.
     */
    pollingFrequencySeconds: number;
    networkTrafficDisplayMode: NetworkTrafficDisplayMode;
    diskUsageDisplayMode: DiskUsageDisplayMode;
    diskLinearLabel: string;
    maximumTemperatureCelsius: number;
    maximumGpuPowerWatts: number | undefined;
    temperatureUnit: TemperatureUnit;
}

export interface WidgetRuntimeCache {
    availableNetworkInterfaces: string;
    availableDiskVolumes: string;
    learnedMaximumDownloadSpeedMbps: number | undefined;
    learnedMaximumUploadSpeedMbps: number | undefined;
    learnedMaximumDiskReadThroughputMebibytesPerSecond: number | undefined;
    learnedMaximumDiskWriteThroughputMebibytesPerSecond: number | undefined;
}

export interface WidgetSettings {
    metric?: Partial<MetricSettings>;
    local?: Partial<WidgetLocalSettings>;
    appearanceOverrides?: Partial<AppearanceSettings>;
    networkOverrides?: Partial<NetworkDefaultSettings>;
    diskThroughputOverrides?: Partial<DiskThroughputDefaultSettings>;
    runtimeCache?: Partial<WidgetRuntimeCache>;
    [key: string]: unknown;
}

export interface WidgetStoredSettings {
    metric: MetricSettings;
    local: WidgetLocalSettings;
    appearanceOverrides: Partial<AppearanceSettings>;
    networkOverrides: Partial<NetworkDefaultSettings>;
    diskThroughputOverrides: Partial<DiskThroughputDefaultSettings>;
    runtimeCache: WidgetRuntimeCache;
    [key: string]: unknown;
}

export interface GlobalSettings {
    overrideWidgetAppearance?: boolean;
    appearanceDefaults?: Partial<AppearanceSettings>;
    networkDefaults?: Partial<NetworkDefaultSettings>;
    diskThroughputDefaults?: Partial<DiskThroughputDefaultSettings>;
    [key: string]: unknown;
}

export interface PluginGlobalSettings {
    overrideWidgetAppearance: boolean;
    appearanceDefaults: AppearanceSettings;
    networkDefaults: NetworkDefaultSettings;
    diskThroughputDefaults: DiskThroughputDefaultSettings;
    [key: string]: unknown;
}

export interface ResolvedWidgetSettings {
    metric: MetricSettings;
    local: WidgetLocalSettings;
    appearance: AppearanceSettings;
    network: NetworkDefaultSettings;
    diskThroughput: DiskThroughputDefaultSettings;
}

export interface SettingsContext {
    actionKind: ActionKind;
    isWindows: boolean;
}

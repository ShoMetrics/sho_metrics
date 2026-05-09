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

export interface ColorRamp {
    solidColor: string;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}

export type ColorRampOverride = Partial<ColorRamp>;

export interface AppearanceSettings {
    graphicType: GraphicType;
    circleStyle: CircleStyle;
    graphicStyle: GraphicStyle;
    colorMode: ColorMode;
    usageColors: ColorRamp;
    downloadColors: ColorRamp;
    uploadColors: ColorRamp;
    diskReadColors: ColorRamp;
    diskWriteColors: ColorRamp;
    lowThreshold: number;
    highThreshold: number;
    lineSmoothingPercent: number;
    gridLineVisibility: GridLineVisibility;
    gridLineType: GridLineType;
}

export type AppearanceColorRampKey =
    | "usageColors"
    | "downloadColors"
    | "uploadColors"
    | "diskReadColors"
    | "diskWriteColors";

export type AppearanceScalarSettings = Omit<AppearanceSettings, AppearanceColorRampKey>;

export type AppearanceSettingsOverride =
    Partial<AppearanceScalarSettings>
    & Partial<Record<AppearanceColorRampKey, ColorRampOverride>>;

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
    appearanceOverrides?: AppearanceSettingsOverride;
    networkOverrides?: Partial<NetworkDefaultSettings>;
    diskThroughputOverrides?: Partial<DiskThroughputDefaultSettings>;
    runtimeCache?: Partial<WidgetRuntimeCache>;
    [key: string]: unknown;
}

export type WidgetStoredSettings = WidgetSettings;

export interface GlobalSettings {
    overrideWidgetAppearance?: boolean;
    appearanceDefaults?: AppearanceSettingsOverride;
    networkDefaults?: Partial<NetworkDefaultSettings>;
    diskThroughputDefaults?: Partial<DiskThroughputDefaultSettings>;
    [key: string]: unknown;
}

export interface ResolvedGlobalSettings {
    overrideWidgetAppearance: boolean;
    appearanceDefaults: AppearanceSettings;
    networkDefaults: NetworkDefaultSettings;
    diskThroughputDefaults: DiskThroughputDefaultSettings;
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

import type {
    AppearanceSettings,
    DiskThroughputDefaultSettings,
    MetricSettings,
    NetworkDefaultSettings,
    PluginGlobalSettings,
    WidgetLocalSettings,
    WidgetRuntimeCache,
} from "./model";

export const defaultAppearanceSettings: AppearanceSettings = {
    graphicType: "circular",
    circleStyle: "value",
    graphicStyle: "flat",
    colorMode: "threshold",
    solidColor: "#3b82f6",
    lowThreshold: 30,
    highThreshold: 70,
    colorLow: "#22c55e",
    colorMedium: "#eab308",
    colorHigh: "#ef4444",
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
    downloadSolidColor: "#3b82f6",
    downloadColorLow: "#22c55e",
    downloadColorMedium: "#3b82f6",
    downloadColorHigh: "#60a5fa",
    uploadSolidColor: "#ef4444",
    uploadColorLow: "#f97316",
    uploadColorMedium: "#ef4444",
    uploadColorHigh: "#f472b6",
    diskReadSolidColor: "#38bdf8",
    diskReadColorLow: "#22c55e",
    diskReadColorMedium: "#38bdf8",
    diskReadColorHigh: "#60a5fa",
    diskWriteSolidColor: "#f472b6",
    diskWriteColorLow: "#f97316",
    diskWriteColorMedium: "#f472b6",
    diskWriteColorHigh: "#fb7185",
};

export const defaultNetworkSettings: NetworkDefaultSettings = {
    networkScaleMode: "auto",
    maximumDownloadSpeedMbps: undefined,
    maximumUploadSpeedMbps: undefined,
    networkUnitBase: "byte",
};

export const defaultDiskThroughputSettings: DiskThroughputDefaultSettings = {
    diskThroughputScaleMode: "auto",
    maximumDiskReadThroughputMebibytesPerSecond: undefined,
    maximumDiskWriteThroughputMebibytesPerSecond: undefined,
};

export const defaultMetricSettings: MetricSettings = {
    networkDirection: "both",
    networkInterfaceId: "",
    diskMetricKind: "usage",
    diskVolumeId: "",
    diskThroughputDirection: "both",
};

export const defaultLocalSettings: WidgetLocalSettings = {
    pollingFrequencySeconds: 1,
    networkTrafficDisplayMode: "mirrored",
    diskUsageDisplayMode: "percentage",
    diskLinearLabel: "",
    maximumTemperatureCelsius: 100,
    maximumGpuPowerWatts: undefined,
    temperatureUnit: "celsius",
};

export const defaultRuntimeCache: WidgetRuntimeCache = {
    availableNetworkInterfaces: "[]",
    availableDiskVolumes: "[]",
    learnedMaximumDownloadSpeedMbps: undefined,
    learnedMaximumUploadSpeedMbps: undefined,
    learnedMaximumDiskReadThroughputMebibytesPerSecond: undefined,
    learnedMaximumDiskWriteThroughputMebibytesPerSecond: undefined,
};

export const defaultPluginGlobalSettings: PluginGlobalSettings = {
    overrideWidgetAppearance: false,
    appearanceDefaults: { ...defaultAppearanceSettings, colorMode: "solid" },
    networkDefaults: { ...defaultNetworkSettings },
    diskThroughputDefaults: { ...defaultDiskThroughputSettings },
};

import type {
    AppearanceSettings,
    DiskThroughputDefaultSettings,
    MetricSettings,
    NetworkDefaultSettings,
    ResolvedGlobalSettings,
    WidgetLocalSettings,
    WidgetRuntimeCache,
} from "./model";

export const defaultAppearanceSettings: AppearanceSettings = {
    graphicType: "circular",
    circleStyle: "value",
    graphicStyle: "flat",
    colorMode: "threshold",
    usageColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#eab308",
        highColor: "#ef4444",
    },
    downloadColors: {
        solidColor: "#3b82f6",
        lowColor: "#22c55e",
        mediumColor: "#3b82f6",
        highColor: "#60a5fa",
    },
    uploadColors: {
        solidColor: "#ef4444",
        lowColor: "#f97316",
        mediumColor: "#ef4444",
        highColor: "#f472b6",
    },
    diskReadColors: {
        solidColor: "#38bdf8",
        lowColor: "#22c55e",
        mediumColor: "#38bdf8",
        highColor: "#60a5fa",
    },
    diskWriteColors: {
        solidColor: "#f472b6",
        lowColor: "#f97316",
        mediumColor: "#f472b6",
        highColor: "#fb7185",
    },
    lowThreshold: 30,
    highThreshold: 70,
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
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
    availableNetworkInterfaces: [],
    availableDiskVolumes: [],
    learnedMaximumDownloadSpeedMbps: undefined,
    learnedMaximumUploadSpeedMbps: undefined,
    learnedMaximumDiskReadThroughputMebibytesPerSecond: undefined,
    learnedMaximumDiskWriteThroughputMebibytesPerSecond: undefined,
};

export const defaultResolvedGlobalSettings: ResolvedGlobalSettings = {
    overrideWidgetAppearance: false,
    appearanceDefaults: {
        ...defaultAppearanceSettings,
        colorMode: "solid",
        usageColors: { ...defaultAppearanceSettings.usageColors },
        downloadColors: { ...defaultAppearanceSettings.downloadColors },
        uploadColors: { ...defaultAppearanceSettings.uploadColors },
        diskReadColors: { ...defaultAppearanceSettings.diskReadColors },
        diskWriteColors: { ...defaultAppearanceSettings.diskWriteColors },
    },
    networkDefaults: { ...defaultNetworkSettings },
    diskThroughputDefaults: { ...defaultDiskThroughputSettings },
};

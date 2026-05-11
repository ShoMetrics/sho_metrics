import {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultResolvedGlobalSettings,
    defaultRuntimeCache,
} from "./defaults";
import type {
    AppearanceSettings,
    AppearanceSettingsOverride,
    ColorRamp,
    DiskMetricKind,
    DiskThroughputDefaultSettings,
    GlobalSettings,
    MetricSettings,
    NetworkDefaultSettings,
    ResolvedGlobalSettings,
    ResolvedWidgetSettings,
    SettingsContext,
    WidgetLocalSettings,
    WidgetRuntimeCache,
    WidgetSettings,
} from "./model";

export function resolveWidgetSettings(options: {
    storedSettings: WidgetSettings;
    globalSettings: GlobalSettings;
    context: SettingsContext;
}): ResolvedWidgetSettings {
    const globalSettings = resolveGlobalSettings(options.globalSettings);
    const metric = resolveMetricSettings(options.storedSettings.metric, options.context);
    const local = resolveLocalSettings(options.storedSettings.local, options.context, metric.diskMetricKind);
    const appearance = mergeAppearanceSettings(
        defaultAppearanceSettings,
        options.storedSettings.appearanceOverrides,
    );
    const network = resolveNetworkSettings(options.storedSettings, globalSettings);
    const diskThroughput = resolveDiskThroughputSettings(options.storedSettings, globalSettings);

    return {
        metric,
        local,
        appearance: globalSettings.overrideWidgetAppearance
            ? globalSettings.appearanceDefaults
            : appearance,
        network,
        diskThroughput,
    };
}

export function resolveGlobalSettings(globalSettings: GlobalSettings | undefined): ResolvedGlobalSettings {
    return {
        overrideWidgetAppearance: globalSettings?.overrideWidgetAppearance === true,
        appearanceDefaults: mergeAppearanceSettings(
            defaultResolvedGlobalSettings.appearanceDefaults,
            globalSettings?.appearanceDefaults,
        ),
        networkDefaults: {
            ...defaultResolvedGlobalSettings.networkDefaults,
            ...globalSettings?.networkDefaults,
        },
        diskThroughputDefaults: {
            ...defaultResolvedGlobalSettings.diskThroughputDefaults,
            ...globalSettings?.diskThroughputDefaults,
        },
    };
}

function mergeAppearanceSettings(
    defaults: AppearanceSettings,
    overrides: AppearanceSettingsOverride | undefined,
): AppearanceSettings {
    return {
        ...defaults,
        ...overrides,
        usageColors: mergeColorRamp(defaults.usageColors, overrides?.usageColors),
        downloadColors: mergeColorRamp(defaults.downloadColors, overrides?.downloadColors),
        uploadColors: mergeColorRamp(defaults.uploadColors, overrides?.uploadColors),
        diskReadColors: mergeColorRamp(defaults.diskReadColors, overrides?.diskReadColors),
        diskWriteColors: mergeColorRamp(defaults.diskWriteColors, overrides?.diskWriteColors),
    };
}

function mergeColorRamp(defaults: ColorRamp, overrides: Partial<ColorRamp> | undefined): ColorRamp {
    return {
        ...defaults,
        ...overrides,
    };
}

function resolveMetricSettings(
    metric: Partial<MetricSettings> | undefined,
    context: SettingsContext,
): MetricSettings {
    const diskMetricKind = context.isWindows && metric?.diskMetricKind === "throughput"
        ? "usage"
        : metric?.diskMetricKind ?? defaultMetricSettings.diskMetricKind;

    return {
        networkDirection: metric?.networkDirection ?? defaultMetricSettings.networkDirection,
        networkInterfaceId: metric?.networkInterfaceId ?? defaultMetricSettings.networkInterfaceId,
        diskMetricKind,
        diskVolumeId: metric?.diskVolumeId ?? defaultMetricSettings.diskVolumeId,
        diskThroughputDirection: diskMetricKind === "throughput"
            ? metric?.diskThroughputDirection ?? defaultMetricSettings.diskThroughputDirection
            : defaultMetricSettings.diskThroughputDirection,
    };
}

function resolveLocalSettings(
    local: Partial<WidgetLocalSettings> | undefined,
    context: SettingsContext,
    diskMetricKind: DiskMetricKind,
): WidgetLocalSettings {
    const defaultPollingFrequencySeconds = context.actionKind === "disk" && diskMetricKind === "usage"
        ? 60
        : defaultLocalSettings.pollingFrequencySeconds;

    return {
        pollingFrequencySeconds: local?.pollingFrequencySeconds ?? defaultPollingFrequencySeconds,
        networkTrafficDisplayMode: local?.networkTrafficDisplayMode
            ?? defaultLocalSettings.networkTrafficDisplayMode,
        diskUsageDisplayMode: local?.diskUsageDisplayMode ?? defaultLocalSettings.diskUsageDisplayMode,
        diskLinearLabel: local?.diskLinearLabel ?? defaultLocalSettings.diskLinearLabel,
        maximumTemperatureCelsius: local?.maximumTemperatureCelsius
            ?? defaultLocalSettings.maximumTemperatureCelsius,
        maximumGpuPowerWatts: local?.maximumGpuPowerWatts,
        temperatureUnit: local?.temperatureUnit ?? defaultLocalSettings.temperatureUnit,
    };
}

function resolveNetworkSettings(
    storedSettings: WidgetSettings,
    globalSettings: ResolvedGlobalSettings,
): NetworkDefaultSettings {
    const runtimeCache = resolveRuntimeCache(storedSettings.runtimeCache);
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
                runtimeCache.learnedMaximumDownloadSpeedMbps,
            ),
            maximumUploadSpeedMbps: maxOptionalPositiveNumber(
                network.maximumUploadSpeedMbps,
                runtimeCache.learnedMaximumUploadSpeedMbps,
            ),
        };
    }

    return network;
}

function resolveDiskThroughputSettings(
    storedSettings: WidgetSettings,
    globalSettings: ResolvedGlobalSettings,
): DiskThroughputDefaultSettings {
    const runtimeCache = resolveRuntimeCache(storedSettings.runtimeCache);
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
                runtimeCache.learnedMaximumDiskReadThroughputMebibytesPerSecond,
            ),
            maximumDiskWriteThroughputMebibytesPerSecond: maxOptionalPositiveNumber(
                diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond,
                runtimeCache.learnedMaximumDiskWriteThroughputMebibytesPerSecond,
            ),
        };
    }

    return diskThroughput;
}

function resolveRuntimeCache(runtimeCache: Partial<WidgetRuntimeCache> | undefined): WidgetRuntimeCache {
    return {
        ...defaultRuntimeCache,
        ...runtimeCache,
    };
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

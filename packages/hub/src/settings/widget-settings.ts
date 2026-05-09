import type {
    AppearanceSettingsOverride,
    DiskThroughputDefaultSettings,
    NetworkDefaultSettings,
    WidgetLocalSettings,
    WidgetRuntimeCache,
    WidgetSettings,
    WidgetStoredSettings,
} from "./model";

export {
    defaultAppearanceSettings,
    defaultDiskThroughputSettings,
    defaultLocalSettings,
    defaultMetricSettings,
    defaultNetworkSettings,
    defaultResolvedGlobalSettings,
    defaultRuntimeCache,
} from "./defaults";

export type {
    ActionKind,
    AppearanceColorRampKey,
    AppearanceSettings,
    AppearanceSettingsOverride,
    AppearanceScalarSettings,
    CircleStyle,
    ColorMode,
    ColorRamp,
    ColorRampOverride,
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
    ResolvedGlobalSettings,
    ResolvedWidgetSettings,
    ScaleMode,
    SettingsContext,
    TemperatureUnit,
    WidgetLocalSettings,
    WidgetRuntimeCache,
    WidgetSettings,
    WidgetStoredSettings,
} from "./model";

export function sanitizeWidgetSettings(settings: WidgetSettings): WidgetStoredSettings {
    const storedSettings: WidgetStoredSettings = {};

    storeBranch(storedSettings, "metric", settings.metric && { ...settings.metric });
    storeBranch(storedSettings, "local", sanitizeLocalSettings(settings.local));
    storeBranch(storedSettings, "appearanceOverrides", sanitizeAppearanceOverrides(settings.appearanceOverrides));
    storeBranch(storedSettings, "networkOverrides", sanitizeNetworkOverrides(settings.networkOverrides));
    storeBranch(storedSettings, "diskThroughputOverrides", sanitizeDiskThroughputOverrides(settings.diskThroughputOverrides));
    storeBranch(storedSettings, "runtimeCache", sanitizeRuntimeCache(settings.runtimeCache));

    return storedSettings;
}

function sanitizeLocalSettings(
    settings: Partial<WidgetLocalSettings> | undefined,
): Partial<WidgetLocalSettings> | undefined {
    if (!settings) {
        return undefined;
    }

    const output = { ...settings };

    if (Object.hasOwn(output, "pollingFrequencySeconds")) {
        output.pollingFrequencySeconds = toNumber(output.pollingFrequencySeconds);
    }

    if (Object.hasOwn(output, "maximumTemperatureCelsius")) {
        output.maximumTemperatureCelsius = toNumber(output.maximumTemperatureCelsius);
    }

    if (Object.hasOwn(output, "maximumGpuPowerWatts")) {
        output.maximumGpuPowerWatts = toOptionalNumber(output.maximumGpuPowerWatts);
    }

    return output;
}

function sanitizeAppearanceOverrides(
    settings: AppearanceSettingsOverride | undefined,
): AppearanceSettingsOverride | undefined {
    if (!settings) {
        return undefined;
    }

    const output = { ...settings };

    if (Object.hasOwn(output, "lowThreshold")) {
        output.lowThreshold = toNumber(output.lowThreshold);
    }

    if (Object.hasOwn(output, "highThreshold")) {
        output.highThreshold = toNumber(output.highThreshold);
    }

    if (Object.hasOwn(output, "lineSmoothingPercent")) {
        output.lineSmoothingPercent = toNumber(output.lineSmoothingPercent);
    }

    return output;
}

function sanitizeNetworkOverrides(
    settings: Partial<NetworkDefaultSettings> | undefined,
): Partial<NetworkDefaultSettings> | undefined {
    if (!settings) {
        return undefined;
    }

    const output = { ...settings };

    if (Object.hasOwn(output, "maximumDownloadSpeedMbps")) {
        output.maximumDownloadSpeedMbps = toOptionalNumber(output.maximumDownloadSpeedMbps);
    }

    if (Object.hasOwn(output, "maximumUploadSpeedMbps")) {
        output.maximumUploadSpeedMbps = toOptionalNumber(output.maximumUploadSpeedMbps);
    }

    return output;
}

function sanitizeDiskThroughputOverrides(
    settings: Partial<DiskThroughputDefaultSettings> | undefined,
): Partial<DiskThroughputDefaultSettings> | undefined {
    if (!settings) {
        return undefined;
    }

    const output = { ...settings };

    if (Object.hasOwn(output, "maximumDiskReadThroughputMebibytesPerSecond")) {
        output.maximumDiskReadThroughputMebibytesPerSecond = toOptionalNumber(
            output.maximumDiskReadThroughputMebibytesPerSecond,
        );
    }

    if (Object.hasOwn(output, "maximumDiskWriteThroughputMebibytesPerSecond")) {
        output.maximumDiskWriteThroughputMebibytesPerSecond = toOptionalNumber(
            output.maximumDiskWriteThroughputMebibytesPerSecond,
        );
    }

    return output;
}

function sanitizeRuntimeCache(
    settings: Partial<WidgetRuntimeCache> | undefined,
): Partial<WidgetRuntimeCache> | undefined {
    if (!settings) {
        return undefined;
    }

    const output = { ...settings };

    if (Object.hasOwn(output, "learnedMaximumDownloadSpeedMbps")) {
        output.learnedMaximumDownloadSpeedMbps = toOptionalNumber(output.learnedMaximumDownloadSpeedMbps);
    }

    if (Object.hasOwn(output, "learnedMaximumUploadSpeedMbps")) {
        output.learnedMaximumUploadSpeedMbps = toOptionalNumber(output.learnedMaximumUploadSpeedMbps);
    }

    if (Object.hasOwn(output, "learnedMaximumDiskReadThroughputMebibytesPerSecond")) {
        output.learnedMaximumDiskReadThroughputMebibytesPerSecond = toOptionalNumber(
            output.learnedMaximumDiskReadThroughputMebibytesPerSecond,
        );
    }

    if (Object.hasOwn(output, "learnedMaximumDiskWriteThroughputMebibytesPerSecond")) {
        output.learnedMaximumDiskWriteThroughputMebibytesPerSecond = toOptionalNumber(
            output.learnedMaximumDiskWriteThroughputMebibytesPerSecond,
        );
    }

    return output;
}

function storeBranch<TBranch extends keyof WidgetStoredSettings>(
    settings: WidgetStoredSettings,
    branch: TBranch,
    value: WidgetStoredSettings[TBranch] | undefined,
): void {
    if (!value) {
        return;
    }

    const storedValue = Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
    ) as WidgetStoredSettings[TBranch];

    if (Object.keys(storedValue as object).length > 0) {
        settings[branch] = storedValue;
    }
}

function toNumber(value: unknown): number {
    return typeof value === "number" ? value : Number(value);
}

function toOptionalNumber(value: unknown): number | undefined {
    return value === "" || value == null ? undefined : toNumber(value);
}

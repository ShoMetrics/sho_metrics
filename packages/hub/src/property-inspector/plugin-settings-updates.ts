import {
    type AppearanceSettings,
    type ColorRamp,
    type DiskThroughputDefaultSettings,
    type NetworkDefaultSettings,
    type PluginGlobalSettings,
} from "../settings/widget-settings";

export function updatePluginSettings(
    settings: PluginGlobalSettings,
    patch: Partial<PluginGlobalSettings>,
): PluginGlobalSettings {
    return {
        ...settings,
        ...patch,
    };
}

export function updatePluginAppearanceDefaults(
    settings: PluginGlobalSettings,
    patch: Partial<AppearanceSettings>,
): PluginGlobalSettings {
    return updatePluginSettings(settings, {
        appearanceDefaults: {
            ...settings.appearanceDefaults,
            ...patch,
        },
    });
}

export function updatePluginUsageColors(
    settings: PluginGlobalSettings,
    patch: Partial<ColorRamp>,
): PluginGlobalSettings {
    return updatePluginAppearanceDefaults(settings, {
        usageColors: {
            ...settings.appearanceDefaults.usageColors,
            ...patch,
        },
    });
}

export function updatePluginNetworkDefaults(
    settings: PluginGlobalSettings,
    patch: Partial<NetworkDefaultSettings>,
): PluginGlobalSettings {
    return updatePluginSettings(settings, {
        networkDefaults: {
            ...settings.networkDefaults,
            ...patch,
        },
    });
}

export function updatePluginDiskThroughputDefaults(
    settings: PluginGlobalSettings,
    patch: Partial<DiskThroughputDefaultSettings>,
): PluginGlobalSettings {
    return updatePluginSettings(settings, {
        diskThroughputDefaults: {
            ...settings.diskThroughputDefaults,
            ...patch,
        },
    });
}

export function updatePluginAppearanceNumber(
    settings: PluginGlobalSettings,
    key: "lowThreshold" | "highThreshold",
    value: string,
): PluginGlobalSettings {
    return updatePluginAppearanceDefaults(settings, {
        [key]: parseRequiredNumber(value),
    });
}

export function updatePluginNetworkOptionalNumber(
    settings: PluginGlobalSettings,
    key: "maximumDownloadSpeedMbps" | "maximumUploadSpeedMbps",
    value: string,
): PluginGlobalSettings {
    return updatePluginNetworkDefaults(settings, {
        [key]: parseOptionalNumber(value),
    });
}

export function updatePluginDiskThroughputOptionalNumber(
    settings: PluginGlobalSettings,
    key: "maximumDiskReadThroughputMebibytesPerSecond" | "maximumDiskWriteThroughputMebibytesPerSecond",
    value: string,
): PluginGlobalSettings {
    return updatePluginDiskThroughputDefaults(settings, {
        [key]: parseOptionalNumber(value),
    });
}

function parseRequiredNumber(value: string): number {
    return Number(value);
}

function parseOptionalNumber(value: string): number | undefined {
    return value === "" ? undefined : Number(value);
}

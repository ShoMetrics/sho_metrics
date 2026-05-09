import { normalizeWidgetStoredSettings } from "./widget-settings";
import type {
    AppearanceSettings,
    DiskThroughputDefaultSettings,
    MetricSettings,
    NetworkDefaultSettings,
    WidgetLocalSettings,
    WidgetSettings,
} from "./model";

export interface RuntimeStatePatch {
    availableNetworkInterfaces?: string;
    availableDiskVolumes?: string;
    learnedMaximumDownloadSpeedMbps?: number;
    learnedMaximumUploadSpeedMbps?: number;
    learnedMaximumDiskReadThroughputMebibytesPerSecond?: number;
    learnedMaximumDiskWriteThroughputMebibytesPerSecond?: number;
}

export function updateWidgetMetric(
    settings: WidgetSettings,
    patch: Partial<MetricSettings>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        metric: {
            ...settings.metric,
            ...patch,
        },
    });
}

export function updateWidgetLocal(
    settings: WidgetSettings,
    patch: Partial<WidgetLocalSettings>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        local: {
            ...settings.local,
            ...patch,
        },
    });
}

export function updateWidgetAppearance(
    settings: WidgetSettings,
    patch: Partial<AppearanceSettings>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        appearanceOverrides: {
            ...settings.appearanceOverrides,
            ...patch,
        },
    });
}

export function updateWidgetNetwork(
    settings: WidgetSettings,
    patch: Partial<NetworkDefaultSettings>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        networkOverrides: {
            ...settings.networkOverrides,
            ...patch,
        },
    });
}

export function updateWidgetDiskThroughput(
    settings: WidgetSettings,
    patch: Partial<DiskThroughputDefaultSettings>,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        diskThroughputOverrides: {
            ...settings.diskThroughputOverrides,
            ...patch,
        },
    });
}

export function updateWidgetRuntimeCache(
    settings: WidgetSettings,
    patch: RuntimeStatePatch,
): WidgetSettings {
    return sanitizeWidgetSettings({
        ...settings,
        runtimeCache: {
            ...settings.runtimeCache,
            ...patch,
        },
    });
}

function sanitizeWidgetSettings(settings: WidgetSettings): WidgetSettings {
    return normalizeWidgetStoredSettings(settings);
}

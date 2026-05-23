import {
    mergeResolvedAppearanceSettings,
    type ResolvedAppearanceSettingsOverride,
} from "./appearance-overrides";
import type {
    ResolvedAppearanceSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedMetricPaintSettings,
    ResolvedMultiColorSet,
} from "./resolved-settings";

export const DEFAULT_USAGE_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#22c55e",
    mediumColor: "#eab308",
    highColor: "#ef4444",
};

export const DEFAULT_DOWNLOAD_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#60A5FA",
    mediumColor: "#2563EB",
    highColor: "#1E3A8A",
};

export const DEFAULT_UPLOAD_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#FDBA74",
    mediumColor: "#F97316",
    highColor: "#C2410C",
};

export const DEFAULT_DISK_READ_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#22c55e",
    mediumColor: "#38bdf8",
    highColor: "#60a5fa",
};

export const DEFAULT_DISK_WRITE_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#f97316",
    mediumColor: "#f472b6",
    highColor: "#fb7185",
};

const DEFAULT_METRIC_ACCENT_PAINT_SETTINGS: ResolvedMetricPaintSettings = {
    colorMode: "multi-color",
    solid: {
        isGradientEnabled: true,
        colors: {
            usageColor: "#3b82f6",
            downloadColor: "#2563EB",
            uploadColor: "#F97316",
            diskReadColor: "#38bdf8",
            diskWriteColor: "#f472b6",
        },
    },
    multiColor: {
        lowThresholdPercent: 30,
        highThresholdPercent: 70,
        isGradientEnabled: true,
        colors: {
            usage: DEFAULT_USAGE_MULTI_COLOR_SET,
            download: DEFAULT_DOWNLOAD_MULTI_COLOR_SET,
            upload: DEFAULT_UPLOAD_MULTI_COLOR_SET,
            diskRead: DEFAULT_DISK_READ_MULTI_COLOR_SET,
            diskWrite: DEFAULT_DISK_WRITE_MULTI_COLOR_SET,
        },
    },
};

const DEFAULT_COLOR_FILLED_PAINT_SETTINGS: ResolvedColorFilledPaintSettings = {
    colorMode: "multi-color",
    solid: {
        color: "#3b82f6",
        isGradientEnabled: true,
    },
    multiColor: {
        colors: DEFAULT_USAGE_MULTI_COLOR_SET,
        isGradientEnabled: true,
    },
};

export const DEFAULT_APPEARANCE_SETTINGS: ResolvedAppearanceSettings = {
    view: {
        selectedView: "circle",
        circleVariant: "full-ring",
    },
    theme: {
        selectedTheme: "flat",
        flat: {
            paint: DEFAULT_METRIC_ACCENT_PAINT_SETTINGS,
        },
        cupertinoGlass: {
            paint: DEFAULT_METRIC_ACCENT_PAINT_SETTINGS,
        },
        colorFilled: {
            paint: DEFAULT_COLOR_FILLED_PAINT_SETTINGS,
        },
        terminal: {
            variant: "clean",
        },
    },
    line: {
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    },
};

/**
 * Builds complete default appearance settings with an optional sparse override.
 *
 * Used by tests, previews, and target-specific defaults that need normal
 * resolved appearance settings without going through persisted storage.
 */
export function buildDefaultAppearanceSettings(
    overrides: ResolvedAppearanceSettingsOverride = {},
): ResolvedAppearanceSettings {
    return mergeResolvedAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS, overrides);
}

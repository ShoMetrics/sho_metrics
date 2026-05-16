import {
    mergeResolvedAppearanceSettings,
    type ResolvedAppearanceSettingsOverride,
} from "./appearance-overrides";
import type {
    ResolvedAppearanceSettings,
    ResolvedMultiColorSet,
} from "./resolved-settings";

export const DEFAULT_USAGE_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#22c55e",
    mediumColor: "#eab308",
    highColor: "#ef4444",
};

export const DEFAULT_DOWNLOAD_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#22c55e",
    mediumColor: "#3b82f6",
    highColor: "#60a5fa",
};

export const DEFAULT_UPLOAD_MULTI_COLOR_SET: ResolvedMultiColorSet = {
    lowColor: "#f97316",
    mediumColor: "#ef4444",
    highColor: "#f472b6",
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

export const DEFAULT_APPEARANCE_SETTINGS: ResolvedAppearanceSettings = {
    graph: {
        viewLayout: "circular",
        circleStyle: "value",
    },
    theme: {
        selectedTheme: "flat",
        terminal: {
            variant: "clean",
        },
    },
    paint: {
        metric: {
            colorMode: "multi-color",
            solid: {
                isGradientEnabled: true,
                colors: {
                    usageColor: "#3b82f6",
                    downloadColor: "#3b82f6",
                    uploadColor: "#ef4444",
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
        },
        colorFilled: {
            colorMode: "multi-color",
            solid: {
                color: "#3b82f6",
                isGradientEnabled: true,
            },
            multiColor: {
                colors: DEFAULT_USAGE_MULTI_COLOR_SET,
                isGradientEnabled: true,
            },
        },
    },
    sparkline: {
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    },
};

export function buildDefaultAppearanceSettings(
    overrides: ResolvedAppearanceSettingsOverride = {},
): ResolvedAppearanceSettings {
    return mergeResolvedAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS, overrides);
}

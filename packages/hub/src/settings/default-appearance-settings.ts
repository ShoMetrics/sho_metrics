import {
    mergeResolvedAppearanceSettings,
    type ResolvedAppearanceSettingsOverride,
} from "./appearance-overrides";
import type {
    ResolvedAppearanceSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedMetricPaintSettings,
    ResolvedMultiColorSet,
    ResolvedTerminalPaintSettings,
    ResolvedTransparentSurfaceSettings,
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
    colorMode: "solid",
    solid: {
        color: "#3b82f6",
        isGradientEnabled: true,
    },
    multiColor: {
        colors: DEFAULT_USAGE_MULTI_COLOR_SET,
        isGradientEnabled: true,
    },
};

const DEFAULT_TERMINAL_PAINT_SETTINGS: ResolvedTerminalPaintSettings = {
    preset: "green",
};

const DEFAULT_FLAT_TRANSPARENT_SURFACE_SETTINGS: ResolvedTransparentSurfaceSettings = {
    enabled: false,
    backgroundOpacityPercent: 50,
    textOutlinePercent: 70,
    shapeOutlinePercent: 30,
};

export const DEFAULT_GLOBAL_TRANSPARENT_SURFACE_SETTINGS: ResolvedTransparentSurfaceSettings = {
    enabled: false,
    backgroundOpacityPercent: 50,
    textOutlinePercent: 70,
    shapeOutlinePercent: 30,
};

const DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS: ResolvedTransparentSurfaceSettings = {
    enabled: false,
    backgroundOpacityPercent: 50,
    textOutlinePercent: 70,
    shapeOutlinePercent: 30,
};

const DEFAULT_DENSE_FLAT_TRANSPARENT_SURFACE_SETTINGS: ResolvedTransparentSurfaceSettings = {
    ...DEFAULT_FLAT_TRANSPARENT_SURFACE_SETTINGS,
    backgroundOpacityPercent: 0,
    textOutlinePercent: 0,
    shapeOutlinePercent: 0,
};

const DEFAULT_DENSE_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS: ResolvedTransparentSurfaceSettings = {
    ...DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
    textOutlinePercent: 0,
    shapeOutlinePercent: 0,
};

export const DEFAULT_APPEARANCE_SETTINGS: ResolvedAppearanceSettings = {
    view: {
        selectedView: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
    },
    theme: {
        selectedTheme: "flat",
        flat: {
            paint: DEFAULT_METRIC_ACCENT_PAINT_SETTINGS,
            transparentSurface: DEFAULT_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        cupertinoGlass: {
            paint: DEFAULT_METRIC_ACCENT_PAINT_SETTINGS,
            transparentSurface: DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        colorFilled: {
            paint: DEFAULT_COLOR_FILLED_PAINT_SETTINGS,
            transparentSurface: DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        terminal: {
            variant: "clean",
            paint: DEFAULT_TERMINAL_PAINT_SETTINGS,
            transparentSurface: DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        pixelWindow: {
            transparentSurface: DEFAULT_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
    },
    line: {
        lineSmoothingPercent: 75,
        gridLineVisibility: "none",
        gridLineType: "horizontal",
    },
};

export const DEFAULT_DENSE_APPEARANCE_SETTINGS: ResolvedAppearanceSettings = {
    ...DEFAULT_APPEARANCE_SETTINGS,
    theme: {
        ...DEFAULT_APPEARANCE_SETTINGS.theme,
        flat: {
            ...DEFAULT_APPEARANCE_SETTINGS.theme.flat,
            transparentSurface: DEFAULT_DENSE_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        cupertinoGlass: {
            ...DEFAULT_APPEARANCE_SETTINGS.theme.cupertinoGlass,
            transparentSurface: DEFAULT_DENSE_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        colorFilled: {
            ...DEFAULT_APPEARANCE_SETTINGS.theme.colorFilled,
            transparentSurface: DEFAULT_DENSE_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        terminal: {
            ...DEFAULT_APPEARANCE_SETTINGS.theme.terminal,
            transparentSurface: DEFAULT_DENSE_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
        pixelWindow: {
            ...DEFAULT_APPEARANCE_SETTINGS.theme.pixelWindow,
            transparentSurface: DEFAULT_DENSE_NON_FLAT_TRANSPARENT_SURFACE_SETTINGS,
        },
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

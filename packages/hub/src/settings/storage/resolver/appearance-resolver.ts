import {
    CircleViewVariant as StoredCircleViewVariant,
    ColorMode as StoredColorMode,
    LineAppearanceSettings_GridLineType as StoredGridLineType,
    LineAppearanceSettings_GridLineVisibility as StoredGridLineVisibility,
    MetricTheme as StoredMetricTheme,
    MetricView as StoredMetricView,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TextViewVariant as StoredTextViewVariant,
    type AppearanceSettings as StoredAppearanceSettings,
    type AppearanceThemeSettings as StoredAppearanceThemeSettings,
    type AppearanceViewSettings as StoredAppearanceViewSettings,
    type ColorFilledMultiColorPaintSettings as StoredColorFilledMultiColorPaintSettings,
    type ColorFilledPaintSettings as StoredColorFilledPaintSettings,
    type ColorFilledSolidPaintSettings as StoredColorFilledSolidPaintSettings,
    type ColorFilledThemeSettings as StoredColorFilledThemeSettings,
    type CupertinoGlassThemeSettings as StoredCupertinoGlassThemeSettings,
    type FlatThemeSettings as StoredFlatThemeSettings,
    type GlobalMultiColorPaintSettings as StoredGlobalMultiColorPaintSettings,
    type GlobalSolidPaintSettings as StoredGlobalSolidPaintSettings,
    type MetricMultiColorPaintSettings as StoredMetricMultiColorPaintSettings,
    type MetricPaintSettings as StoredMetricPaintSettings,
    type MetricSolidPaintSettings as StoredMetricSolidPaintSettings,
    type MultiColorSet as StoredMultiColorSet,
    type TerminalPaintSettings as StoredTerminalPaintSettings,
    type TerminalThemeSettings as StoredTerminalThemeSettings,
    type TransparentSurfaceSettings as StoredTransparentSurfaceSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    CircleViewVariant,
    ColorMode,
    GridLineType,
    GridLineVisibility,
    MetricTheme,
    MetricView,
    ResolvedAppearanceSettings,
    ResolvedAppearanceThemeSettings,
    ResolvedAppearanceViewSettings,
    ResolvedColorFilledMultiColorPaintSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedColorFilledSolidPaintSettings,
    ResolvedColorFilledThemeSettings,
    ResolvedCupertinoGlassThemeSettings,
    ResolvedFlatThemeSettings,
    ResolvedGlobalMetricPaintSettings,
    ResolvedGlobalMultiColorPaintSettings,
    ResolvedGlobalPaintOverride,
    ResolvedGlobalSettings,
    ResolvedGlobalSolidPaintSettings,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalTransparentSurfaceOverride,
    ResolvedGlobalViewOverride,
    ResolvedLineAppearanceSettings,
    ResolvedMetricPaintSettings,
    ResolvedMetricMultiColorPaintSettings,
    ResolvedMetricSolidPaintSettings,
    ResolvedMetricTarget,
    ResolvedMultiColorSet,
    ResolvedTerminalPaintSettings,
    ResolvedTerminalThemeSettings,
    ResolvedTransparentSurfaceSettings,
    TerminalPalettePreset,
    TerminalThemeVariant,
    TextViewVariant,
} from "../../resolved-settings";
import {
    buildDefaultAppearanceSettings,
    DEFAULT_APPEARANCE_SETTINGS,
    DEFAULT_DENSE_APPEARANCE_SETTINGS,
    resolveDefaultTransparentSurfaceSettings,
} from "../../default-appearance-settings";
import {
    resolveStoredEnum,
    resolveStoredPercent,
} from "./resolver-helpers";

const DEFAULT_NETWORK_APPEARANCE_SETTINGS = buildDefaultAppearanceSettings({
    theme: {
        flat: {
            paint: {
                colorMode: "solid",
            },
        },
        cupertinoGlass: {
            paint: {
                colorMode: "solid",
            },
        },
    },
});

const DEFAULT_CATALOG_APPEARANCE_SETTINGS = buildDefaultAppearanceSettings({
    view: {
        selectedView: "text",
    },
});

const TEXT_VIEW_DEFAULT_METRIC_COLOR_MODE = "black-white" satisfies ColorMode;

const metricViewByProto = {
    [StoredMetricView.UNSPECIFIED]: undefined,
    [StoredMetricView.CIRCLE]: "circle",
    [StoredMetricView.TEXT]: "text",
    [StoredMetricView.BAR]: "bar",
    [StoredMetricView.LINE]: "line",
} satisfies Record<StoredMetricView, MetricView | undefined>;

const circleViewVariantByProto = {
    [StoredCircleViewVariant.UNSPECIFIED]: undefined,
    [StoredCircleViewVariant.FULL_RING]: "full-ring",
    [StoredCircleViewVariant.MINIMAL]: "minimal",
    [StoredCircleViewVariant.GAUGE]: "gauge",
} satisfies Record<StoredCircleViewVariant, CircleViewVariant | undefined>;

const textViewVariantByProto = {
    [StoredTextViewVariant.UNSPECIFIED]: undefined,
    [StoredTextViewVariant.CENTERED]: "centered",
    [StoredTextViewVariant.TITLE_CARD]: "title-card",
} satisfies Record<StoredTextViewVariant, TextViewVariant | undefined>;

const metricThemeByProto = {
    [StoredMetricTheme.UNSPECIFIED]: undefined,
    [StoredMetricTheme.FLAT]: "flat",
    [StoredMetricTheme.CUPERTINO_GLASS]: "cupertino-glass",
    [StoredMetricTheme.COLOR_FILLED]: "color-filled",
    [StoredMetricTheme.TERMINAL]: "terminal",
    [StoredMetricTheme.PIXEL_WINDOW]: "pixel-window",
} satisfies Record<StoredMetricTheme, MetricTheme | undefined>;

const terminalThemeVariantByProto = {
    [StoredTerminalThemeVariant.UNSPECIFIED]: undefined,
    [StoredTerminalThemeVariant.CLEAN]: "clean",
    [StoredTerminalThemeVariant.VINTAGE]: "vintage",
} satisfies Record<StoredTerminalThemeVariant, TerminalThemeVariant | undefined>;

const terminalPalettePresetByProto = {
    [StoredTerminalPalettePreset.UNSPECIFIED]: undefined,
    [StoredTerminalPalettePreset.GREEN]: "green",
    [StoredTerminalPalettePreset.AMBER]: "amber",
    [StoredTerminalPalettePreset.CYAN]: "cyan",
    [StoredTerminalPalettePreset.WHITE]: "white",
} satisfies Record<StoredTerminalPalettePreset, TerminalPalettePreset | undefined>;

const colorModeByProto = {
    [StoredColorMode.UNSPECIFIED]: undefined,
    [StoredColorMode.MULTI_COLOR]: "multi-color",
    [StoredColorMode.SOLID]: "solid",
    [StoredColorMode.BLACK_WHITE]: "black-white",
} satisfies Record<StoredColorMode, ColorMode | undefined>;

const gridLineVisibilityByProto = {
    [StoredGridLineVisibility.UNSPECIFIED]: undefined,
    [StoredGridLineVisibility.ADAPTIVE]: "adaptive",
    [StoredGridLineVisibility.ALWAYS]: "always",
    [StoredGridLineVisibility.NONE]: "none",
} satisfies Record<StoredGridLineVisibility, GridLineVisibility | undefined>;

const gridLineTypeByProto = {
    [StoredGridLineType.UNSPECIFIED]: undefined,
    [StoredGridLineType.HORIZONTAL]: "horizontal",
    [StoredGridLineType.VERTICAL]: "vertical",
} satisfies Record<StoredGridLineType, GridLineType | undefined>;

export function resolveDenseAppearanceSettings(
    storedAppearance: StoredAppearanceSettings | undefined,
    globalSettings: ResolvedGlobalSettings,
): ResolvedAppearanceSettings {
    const appearance = {
        view: DEFAULT_DENSE_APPEARANCE_SETTINGS.view,
        theme: resolveAppearanceThemeSettings(DEFAULT_DENSE_APPEARANCE_SETTINGS.theme, storedAppearance?.theme),
        line: DEFAULT_DENSE_APPEARANCE_SETTINGS.line,
        transparentSurface: resolveTransparentSurfaceSettings(
            DEFAULT_DENSE_APPEARANCE_SETTINGS.transparentSurface,
            storedAppearance?.transparentSurface,
        ),
    } satisfies ResolvedAppearanceSettings;
    const appearanceWithThemeOverride = globalSettings.themeOverride
        ? applyGlobalThemeOverride(appearance, globalSettings.themeOverride)
        : appearance;
    const appearanceWithPaintOverride = globalSettings.paintOverride
        ? applyGlobalPaintOverride(appearanceWithThemeOverride, globalSettings.paintOverride)
        : appearanceWithThemeOverride;

    return globalSettings.transparentSurfaceOverride
        ? applyGlobalTransparentSurfaceOverride(appearanceWithPaintOverride, globalSettings.transparentSurfaceOverride)
        : appearanceWithPaintOverride;
}

export function resolveDefaultAppearanceSettings(target: ResolvedMetricTarget): ResolvedAppearanceSettings {
    if (target.domain === "network") {
        return DEFAULT_NETWORK_APPEARANCE_SETTINGS;
    }
    if (target.domain === "catalog" || target.domain === "customMetric") {
        return DEFAULT_CATALOG_APPEARANCE_SETTINGS;
    }

    return DEFAULT_APPEARANCE_SETTINGS;
}

export function mergeAppearanceSettings(
    defaults: ResolvedAppearanceSettings,
    storedAppearance: StoredAppearanceSettings | undefined,
): ResolvedAppearanceSettings {
    const view = resolveAppearanceViewSettings(defaults.view, storedAppearance?.view);
    const selectedTheme = resolveStoredEnum(
        storedAppearance?.theme?.selectedTheme,
        metricThemeByProto,
        defaults.theme.selectedTheme,
    );
    const appearanceDefaults = resolveAppearanceDefaultsForViewAndTheme(defaults, view, selectedTheme);

    return {
        view,
        theme: resolveAppearanceThemeSettings(appearanceDefaults.theme, storedAppearance?.theme, selectedTheme),
        line: resolveLineAppearanceSettings(appearanceDefaults.line, storedAppearance?.line),
        transparentSurface: resolveTransparentSurfaceSettings(
            appearanceDefaults.transparentSurface,
            storedAppearance?.transparentSurface,
        ),
    };
}

export function resolveAppearanceDefaultsForViewAndTheme(
    targetDefaults: ResolvedAppearanceSettings,
    resolvedView: ResolvedAppearanceViewSettings,
    selectedTheme: MetricTheme,
): ResolvedAppearanceSettings {
    const themeDefaults = {
        ...targetDefaults,
        transparentSurface: resolveDefaultTransparentSurfaceSettings(selectedTheme),
    };

    if (resolvedView.selectedView !== "text") {
        return themeDefaults;
    }

    switch (selectedTheme) {
        case "flat":
            return {
                ...themeDefaults,
                theme: {
                    ...themeDefaults.theme,
                    flat: {
                        ...themeDefaults.theme.flat,
                        paint: {
                            ...themeDefaults.theme.flat.paint,
                            colorMode: TEXT_VIEW_DEFAULT_METRIC_COLOR_MODE,
                        },
                    },
                },
            };
        case "cupertino-glass":
            return {
                ...themeDefaults,
                theme: {
                    ...themeDefaults.theme,
                    cupertinoGlass: {
                        ...themeDefaults.theme.cupertinoGlass,
                        paint: {
                            ...themeDefaults.theme.cupertinoGlass.paint,
                            colorMode: TEXT_VIEW_DEFAULT_METRIC_COLOR_MODE,
                        },
                    },
                },
            };
        case "color-filled":
        case "terminal":
        case "pixel-window":
            return themeDefaults;
    }
}

export function resolveAppearanceThemeSettings(
    defaults: ResolvedAppearanceThemeSettings,
    storedTheme: StoredAppearanceThemeSettings | undefined,
    selectedTheme = resolveStoredEnum(storedTheme?.selectedTheme, metricThemeByProto, defaults.selectedTheme),
): ResolvedAppearanceThemeSettings {
    return {
        selectedTheme,
        flat: resolveFlatThemeSettings(defaults.flat, storedTheme?.flat),
        cupertinoGlass: resolveCupertinoGlassThemeSettings(defaults.cupertinoGlass, storedTheme?.cupertinoGlass),
        colorFilled: resolveColorFilledThemeSettings(defaults.colorFilled, storedTheme?.colorFilled),
        terminal: resolveTerminalThemeSettings(defaults.terminal, storedTheme?.terminal),
    };
}

function resolveFlatThemeSettings(
    defaults: ResolvedFlatThemeSettings,
    storedTheme: StoredFlatThemeSettings | undefined,
): ResolvedFlatThemeSettings {
    return {
        paint: resolveMetricPaintSettings(defaults.paint, storedTheme?.paint),
    };
}

function resolveCupertinoGlassThemeSettings(
    defaults: ResolvedCupertinoGlassThemeSettings,
    storedTheme: StoredCupertinoGlassThemeSettings | undefined,
): ResolvedCupertinoGlassThemeSettings {
    return {
        paint: resolveMetricPaintSettings(defaults.paint, storedTheme?.paint),
    };
}

function resolveColorFilledThemeSettings(
    defaults: ResolvedColorFilledThemeSettings,
    storedTheme: StoredColorFilledThemeSettings | undefined,
): ResolvedColorFilledThemeSettings {
    return {
        paint: resolveColorFilledPaintSettings(defaults.paint, storedTheme?.paint),
    };
}

function resolveTerminalThemeSettings(
    defaults: ResolvedTerminalThemeSettings,
    storedTerminal: StoredTerminalThemeSettings | undefined,
): ResolvedTerminalThemeSettings {
    return {
        variant: resolveStoredEnum(storedTerminal?.variant, terminalThemeVariantByProto, defaults.variant),
        paint: resolveTerminalPaintSettings(defaults.paint, storedTerminal?.paint),
    };
}

export function resolveTerminalPaintSettings(
    defaults: ResolvedTerminalPaintSettings,
    storedPaint: StoredTerminalPaintSettings | undefined,
): ResolvedTerminalPaintSettings {
    return {
        preset: resolveStoredEnum(storedPaint?.preset, terminalPalettePresetByProto, defaults.preset),
    };
}

export function resolveTransparentSurfaceSettings(
    defaults: ResolvedTransparentSurfaceSettings,
    storedSurface: StoredTransparentSurfaceSettings | undefined,
): ResolvedTransparentSurfaceSettings {
    return {
        enabled: storedSurface?.enabled ?? defaults.enabled,
        backgroundOpacityPercent: resolveStoredPercent(
            storedSurface?.backgroundOpacityPercent,
            defaults.backgroundOpacityPercent,
        ),
        textOutlinePercent: resolveStoredPercent(storedSurface?.textOutlinePercent, defaults.textOutlinePercent),
        shapeOutlinePercent: resolveStoredPercent(storedSurface?.shapeOutlinePercent, defaults.shapeOutlinePercent),
    };
}

function resolveGlobalMetricPaintAsMetricPaint(
    paintOverride: ResolvedGlobalMetricPaintSettings,
): ResolvedMetricPaintSettings {
    return {
        colorMode: paintOverride.colorMode,
        solid: {
            isGradientEnabled: paintOverride.solid.isGradientEnabled,
            colors: {
                usageColor: paintOverride.solid.color,
                downloadColor: paintOverride.solid.color,
                uploadColor: paintOverride.solid.color,
                diskReadColor: paintOverride.solid.color,
                diskWriteColor: paintOverride.solid.color,
            },
        },
        multiColor: {
            lowThresholdPercent: paintOverride.multiColor.lowThresholdPercent,
            highThresholdPercent: paintOverride.multiColor.highThresholdPercent,
            isGradientEnabled: paintOverride.multiColor.isGradientEnabled,
            colors: {
                usage: paintOverride.multiColor.colors,
                download: paintOverride.multiColor.colors,
                upload: paintOverride.multiColor.colors,
                diskRead: paintOverride.multiColor.colors,
                diskWrite: paintOverride.multiColor.colors,
            },
        },
    };
}

export function resolveAppearanceViewSettings(
    defaults: ResolvedAppearanceViewSettings,
    storedView: StoredAppearanceViewSettings | undefined,
): ResolvedAppearanceViewSettings {
    return {
        selectedView: resolveStoredEnum(storedView?.selectedView, metricViewByProto, defaults.selectedView),
        circleVariant: resolveStoredEnum(
            storedView?.circleVariant,
            circleViewVariantByProto,
            defaults.circleVariant,
        ),
        textVariant: resolveStoredEnum(
            storedView?.textVariant,
            textViewVariantByProto,
            defaults.textVariant,
        ),
    };
}

export function resolveColorFilledPaintSettings(
    defaults: ResolvedColorFilledPaintSettings,
    storedPaint: StoredColorFilledPaintSettings | undefined,
): ResolvedColorFilledPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedPaint?.colorMode, colorModeByProto, defaults.colorMode),
        solid: resolveColorFilledSolidPaintSettings(defaults.solid, storedPaint?.solid),
        multiColor: resolveColorFilledMultiColorPaintSettings(defaults.multiColor, storedPaint?.multiColor),
    };
}

function resolveColorFilledSolidPaintSettings(
    defaults: ResolvedColorFilledSolidPaintSettings,
    storedSolid: StoredColorFilledSolidPaintSettings | undefined,
): ResolvedColorFilledSolidPaintSettings {
    return {
        color: storedSolid?.color ?? defaults.color,
        isGradientEnabled: storedSolid?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveColorFilledMultiColorPaintSettings(
    defaults: ResolvedColorFilledMultiColorPaintSettings,
    storedMultiColor: StoredColorFilledMultiColorPaintSettings | undefined,
): ResolvedColorFilledMultiColorPaintSettings {
    return {
        colors: resolveMultiColorSet(defaults.colors, storedMultiColor?.colors),
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

function resolveMetricPaintSettings(
    defaults: ResolvedMetricPaintSettings,
    storedMetricPaint: StoredMetricPaintSettings | undefined,
): ResolvedMetricPaintSettings {
    return {
        colorMode: resolveStoredEnum(storedMetricPaint?.colorMode, colorModeByProto, defaults.colorMode),
        solid: resolveMetricSolidPaintSettings(defaults.solid, storedMetricPaint?.solid),
        multiColor: resolveMetricMultiColorPaintSettings(defaults.multiColor, storedMetricPaint?.multiColor),
    };
}

function resolveMetricSolidPaintSettings(
    defaults: ResolvedMetricSolidPaintSettings,
    storedSolid: StoredMetricSolidPaintSettings | undefined,
): ResolvedMetricSolidPaintSettings {
    const storedColors = storedSolid?.colors;

    return {
        isGradientEnabled: storedSolid?.gradientEnabled ?? defaults.isGradientEnabled,
        colors: {
            usageColor: storedColors?.usageColor ?? defaults.colors.usageColor,
            downloadColor: storedColors?.downloadColor ?? defaults.colors.downloadColor,
            uploadColor: storedColors?.uploadColor ?? defaults.colors.uploadColor,
            diskReadColor: storedColors?.diskReadColor ?? defaults.colors.diskReadColor,
            diskWriteColor: storedColors?.diskWriteColor ?? defaults.colors.diskWriteColor,
        },
    };
}

function resolveMetricMultiColorPaintSettings(
    defaults: ResolvedMetricMultiColorPaintSettings,
    storedMultiColor: StoredMetricMultiColorPaintSettings | undefined,
): ResolvedMetricMultiColorPaintSettings {
    const storedColors = storedMultiColor?.colors;

    return {
        lowThresholdPercent: storedMultiColor?.lowThresholdPercent ?? defaults.lowThresholdPercent,
        highThresholdPercent: storedMultiColor?.highThresholdPercent ?? defaults.highThresholdPercent,
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
        colors: {
            usage: resolveMultiColorSet(defaults.colors.usage, storedColors?.usage),
            download: resolveMultiColorSet(defaults.colors.download, storedColors?.download),
            upload: resolveMultiColorSet(defaults.colors.upload, storedColors?.upload),
            diskRead: resolveMultiColorSet(defaults.colors.diskRead, storedColors?.diskRead),
            diskWrite: resolveMultiColorSet(defaults.colors.diskWrite, storedColors?.diskWrite),
        },
    };
}

function resolveLineAppearanceSettings(
    defaults: ResolvedLineAppearanceSettings,
    storedLine: StoredAppearanceSettings["line"] | undefined,
): ResolvedLineAppearanceSettings {
    return {
        lineSmoothingPercent: storedLine?.lineSmoothingPercent ?? defaults.lineSmoothingPercent,
        gridLineVisibility: resolveStoredEnum(
            storedLine?.gridLineVisibility,
            gridLineVisibilityByProto,
            defaults.gridLineVisibility,
        ),
        gridLineType: resolveStoredEnum(storedLine?.gridLineType, gridLineTypeByProto, defaults.gridLineType),
    };
}

export function resolveGlobalSolidPaintSettings(
    storedSolid: StoredGlobalSolidPaintSettings | undefined,
): ResolvedGlobalSolidPaintSettings {
    return {
        color: storedSolid?.color ?? DEFAULT_APPEARANCE_SETTINGS.theme.flat.paint.solid.colors.usageColor,
        isGradientEnabled: storedSolid?.gradientEnabled
            ?? DEFAULT_APPEARANCE_SETTINGS.theme.flat.paint.solid.isGradientEnabled,
    };
}

export function resolveGlobalMultiColorPaintSettings(
    storedMultiColor: StoredGlobalMultiColorPaintSettings | undefined,
): ResolvedGlobalMultiColorPaintSettings {
    const defaults = DEFAULT_APPEARANCE_SETTINGS.theme.flat.paint.multiColor;

    return {
        colors: resolveMultiColorSet(defaults.colors.usage, storedMultiColor?.colors),
        lowThresholdPercent: storedMultiColor?.lowThresholdPercent ?? defaults.lowThresholdPercent,
        highThresholdPercent: storedMultiColor?.highThresholdPercent ?? defaults.highThresholdPercent,
        isGradientEnabled: storedMultiColor?.gradientEnabled ?? defaults.isGradientEnabled,
    };
}

export function applyGlobalViewOverride(
    appearance: ResolvedAppearanceSettings,
    viewOverride: ResolvedGlobalViewOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        view: viewOverride.view,
    };
}

export function applyGlobalThemeOverride(
    appearance: ResolvedAppearanceSettings,
    themeOverride: ResolvedGlobalThemeOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        theme: themeOverride.theme,
    };
}

export function applyGlobalTransparentSurfaceOverride(
    appearance: ResolvedAppearanceSettings,
    transparentSurfaceOverride: ResolvedGlobalTransparentSurfaceOverride,
): ResolvedAppearanceSettings {
    return {
        ...appearance,
        transparentSurface: transparentSurfaceOverride.transparentSurface,
    };
}

export function applyGlobalPaintOverride(
    appearance: ResolvedAppearanceSettings,
    paintOverride: ResolvedGlobalPaintOverride,
): ResolvedAppearanceSettings {
    const metricPaintOverride = resolveGlobalMetricPaintAsMetricPaint(paintOverride.metric);

    switch (appearance.theme.selectedTheme) {
        case "flat":
            return {
                ...appearance,
                theme: {
                    ...appearance.theme,
                    flat: {
                        ...appearance.theme.flat,
                        paint: metricPaintOverride,
                    },
                },
            };
        case "cupertino-glass":
            return {
                ...appearance,
                theme: {
                    ...appearance.theme,
                    cupertinoGlass: {
                        ...appearance.theme.cupertinoGlass,
                        paint: metricPaintOverride,
                    },
                },
            };
        case "color-filled":
            return {
                ...appearance,
                theme: {
                    ...appearance.theme,
                    colorFilled: {
                        ...appearance.theme.colorFilled,
                        paint: paintOverride.colorFilled,
                    },
                },
            };
        case "terminal":
            return {
                ...appearance,
                theme: {
                    ...appearance.theme,
                    terminal: {
                        ...appearance.theme.terminal,
                        paint: paintOverride.terminal,
                    },
                },
            };
        case "pixel-window":
            return appearance;
    }
}

function resolveMultiColorSet(
    defaults: ResolvedMultiColorSet,
    storedColors: StoredMultiColorSet | undefined,
): ResolvedMultiColorSet {
    return {
        lowColor: storedColors?.lowColor ?? defaults.lowColor,
        mediumColor: storedColors?.mediumColor ?? defaults.mediumColor,
        highColor: storedColors?.highColor ?? defaults.highColor,
    };
}

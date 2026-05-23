import type {
    ColorMode,
    MetricTheme,
    TerminalThemeVariant,
    ResolvedAppearanceSettings,
    ResolvedAppearanceViewSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedLineAppearanceSettings,
    ResolvedMetricPaintSettings,
    ResolvedMetricMultiColorChannelColors,
    ResolvedMetricMultiColorPaintSettings,
    ResolvedMultiColorSet,
} from "./resolved-settings";

export type MetricColorChannel = keyof ResolvedMetricMultiColorChannelColors;

export interface ResolvedAppearanceSettingsOverride {
    readonly view?: ResolvedAppearanceViewSettingsOverride | undefined;
    readonly theme?: ResolvedAppearanceThemeSettingsOverride | undefined;
    readonly line?: ResolvedLineAppearanceSettingsOverride | undefined;
}

export interface ResolvedAppearanceViewSettingsOverride {
    readonly selectedView?: ResolvedAppearanceViewSettings["selectedView"] | undefined;
    readonly circleVariant?: ResolvedAppearanceViewSettings["circleVariant"] | undefined;
}

export interface ResolvedAppearanceThemeSettingsOverride {
    readonly selectedTheme?: MetricTheme | undefined;
    readonly flat?: ResolvedFlatThemeSettingsOverride | undefined;
    readonly cupertinoGlass?: ResolvedCupertinoGlassThemeSettingsOverride | undefined;
    readonly colorFilled?: ResolvedColorFilledThemeSettingsOverride | undefined;
    readonly terminal?: ResolvedTerminalThemeSettingsOverride | undefined;
}

export interface ResolvedFlatThemeSettingsOverride {
    readonly paint?: ResolvedMetricPaintSettingsOverride | undefined;
}

export interface ResolvedCupertinoGlassThemeSettingsOverride {
    readonly paint?: ResolvedMetricPaintSettingsOverride | undefined;
}

export interface ResolvedColorFilledThemeSettingsOverride {
    readonly paint?: ResolvedColorFilledPaintSettingsOverride | undefined;
}

export interface ResolvedTerminalThemeSettingsOverride {
    readonly variant?: TerminalThemeVariant | undefined;
}

export interface ResolvedMetricPaintSettingsOverride {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: ResolvedMetricSolidPaintSettingsOverride | undefined;
    readonly multiColor?: ResolvedMetricMultiColorPaintSettingsOverride | undefined;
}

export interface ResolvedMetricSolidPaintSettingsOverride {
    readonly colors?: ResolvedMetricSolidChannelColorsOverride | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedMetricSolidChannelColorsOverride {
    readonly usageColor?: string | undefined;
    readonly downloadColor?: string | undefined;
    readonly uploadColor?: string | undefined;
    readonly diskReadColor?: string | undefined;
    readonly diskWriteColor?: string | undefined;
}

export interface ResolvedMetricMultiColorPaintSettingsOverride {
    readonly colors?: ResolvedMetricMultiColorChannelColorsOverride | undefined;
    readonly lowThresholdPercent?: number | undefined;
    readonly highThresholdPercent?: number | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedMetricMultiColorChannelColorsOverride {
    readonly usage?: ResolvedMultiColorSetOverride | undefined;
    readonly download?: ResolvedMultiColorSetOverride | undefined;
    readonly upload?: ResolvedMultiColorSetOverride | undefined;
    readonly diskRead?: ResolvedMultiColorSetOverride | undefined;
    readonly diskWrite?: ResolvedMultiColorSetOverride | undefined;
}

export interface ResolvedColorFilledPaintSettingsOverride {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: ResolvedColorFilledSolidPaintSettingsOverride | undefined;
    readonly multiColor?: ResolvedColorFilledMultiColorPaintSettingsOverride | undefined;
}

export interface ResolvedColorFilledSolidPaintSettingsOverride {
    readonly color?: string | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedColorFilledMultiColorPaintSettingsOverride {
    readonly colors?: ResolvedMultiColorSetOverride | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedMultiColorSetOverride {
    readonly lowColor?: string | undefined;
    readonly mediumColor?: string | undefined;
    readonly highColor?: string | undefined;
}

export interface ResolvedLineAppearanceSettingsOverride {
    readonly lineSmoothingPercent?: ResolvedLineAppearanceSettings["lineSmoothingPercent"] | undefined;
    readonly gridLineVisibility?: ResolvedLineAppearanceSettings["gridLineVisibility"] | undefined;
    readonly gridLineType?: ResolvedLineAppearanceSettings["gridLineType"] | undefined;
}

/**
 * Merges a sparse appearance override into complete resolved appearance settings.
 *
 * Used by previews and metric view rendering when a caller needs a temporary
 * view, theme, or paint override without writing that intent back to storage.
 */
export function mergeResolvedAppearanceSettings(
    settings: ResolvedAppearanceSettings,
    override: ResolvedAppearanceSettingsOverride | undefined,
): ResolvedAppearanceSettings {
    if (!override) {
        return settings;
    }

    return {
        view: {
            ...settings.view,
            ...override.view,
        },
        theme: {
            ...settings.theme,
            selectedTheme: override.theme?.selectedTheme ?? settings.theme.selectedTheme,
            flat: {
                ...settings.theme.flat,
                ...override.theme?.flat,
                paint: mergeMetricPaintSettings(settings.theme.flat.paint, override.theme?.flat?.paint),
            },
            cupertinoGlass: {
                ...settings.theme.cupertinoGlass,
                ...override.theme?.cupertinoGlass,
                paint: mergeMetricPaintSettings(
                    settings.theme.cupertinoGlass.paint,
                    override.theme?.cupertinoGlass?.paint,
                ),
            },
            colorFilled: {
                ...settings.theme.colorFilled,
                ...override.theme?.colorFilled,
                paint: mergeColorFilledPaintSettings(
                    settings.theme.colorFilled.paint,
                    override.theme?.colorFilled?.paint,
                ),
            },
            terminal: {
                ...settings.theme.terminal,
                ...override.theme?.terminal,
            },
        },
        line: {
            ...settings.line,
            ...override.line,
        },
    };
}

/**
 * Builds a theme-owned override for metric accent paint.
 *
 * Used by color controls and domain view builders when the active theme exposes
 * foreground accent paint for rings, bars, lines, or large text. Returns
 * `undefined` for themes whose paint is not metric-accent based.
 */
export function buildMetricAccentPaintAppearanceOverride(
    selectedTheme: MetricTheme,
    paint: ResolvedMetricPaintSettingsOverride,
): ResolvedAppearanceSettingsOverride | undefined {
    switch (selectedTheme) {
        case "flat":
            return { theme: { flat: { paint } } };
        case "cupertino-glass":
            return { theme: { cupertinoGlass: { paint } } };
        case "color-filled":
        case "terminal":
            return undefined;
    }
}

/**
 * Builds a theme-owned override for Color Filled background paint.
 *
 * Used by Color Filled controls when the user's color mode edits the widget
 * background instead of the metric accent paint.
 */
export function buildColorFilledPaintAppearanceOverride(
    paint: ResolvedColorFilledPaintSettingsOverride,
): ResolvedAppearanceSettingsOverride {
    return {
        theme: {
            colorFilled: { paint },
        },
    };
}

function mergeMetricPaintSettings(
    paint: ResolvedMetricPaintSettings,
    override: ResolvedMetricPaintSettingsOverride | undefined,
): ResolvedMetricPaintSettings {
    return {
        ...paint,
        ...override,
        solid: {
            ...paint.solid,
            ...override?.solid,
            colors: {
                ...paint.solid.colors,
                ...override?.solid?.colors,
            },
        },
        multiColor: {
            ...paint.multiColor,
            ...override?.multiColor,
            colors: mergeMetricMultiColorChannelColors(
                paint.multiColor.colors,
                override?.multiColor?.colors,
            ),
        },
    };
}

function mergeColorFilledPaintSettings(
    paint: ResolvedColorFilledPaintSettings,
    override: ResolvedColorFilledPaintSettingsOverride | undefined,
): ResolvedColorFilledPaintSettings {
    return {
        ...paint,
        ...override,
        solid: {
            ...paint.solid,
            ...override?.solid,
        },
        multiColor: {
            ...paint.multiColor,
            ...override?.multiColor,
            colors: {
                ...paint.multiColor.colors,
                ...override?.multiColor?.colors,
            },
        },
    };
}

function mergeMetricMultiColorChannelColors(
    colors: ResolvedMetricMultiColorPaintSettings["colors"],
    override: ResolvedMetricMultiColorPaintSettingsOverride["colors"] | undefined,
): ResolvedMetricMultiColorPaintSettings["colors"] {
    return {
        usage: mergeMultiColorSet(colors.usage, override?.usage),
        download: mergeMultiColorSet(colors.download, override?.download),
        upload: mergeMultiColorSet(colors.upload, override?.upload),
        diskRead: mergeMultiColorSet(colors.diskRead, override?.diskRead),
        diskWrite: mergeMultiColorSet(colors.diskWrite, override?.diskWrite),
    };
}

function mergeMultiColorSet(
    colors: ResolvedMultiColorSet,
    override: ResolvedMultiColorSetOverride | undefined,
): ResolvedMultiColorSet {
    return {
        ...colors,
        ...override,
    };
}

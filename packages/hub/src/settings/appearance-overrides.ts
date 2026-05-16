import type {
    ColorMode,
    MetricTheme,
    TerminalThemeVariant,
    ResolvedAppearanceGraphSettings,
    ResolvedAppearanceSettings,
    ResolvedMetricMultiColorChannelColors,
    ResolvedMetricMultiColorPaintSettings,
    ResolvedMultiColorSet,
    ResolvedSparklineAppearanceSettings,
} from "./resolved-settings";

export type MetricColorChannel = keyof ResolvedMetricMultiColorChannelColors;

export interface ResolvedAppearanceSettingsOverride {
    readonly graph?: ResolvedAppearanceGraphSettingsOverride | undefined;
    readonly theme?: ResolvedAppearanceThemeSettingsOverride | undefined;
    readonly paint?: ResolvedAppearancePaintSettingsOverride | undefined;
    readonly sparkline?: ResolvedSparklineAppearanceSettingsOverride | undefined;
}

export interface ResolvedAppearanceGraphSettingsOverride {
    readonly viewLayout?: ResolvedAppearanceGraphSettings["viewLayout"] | undefined;
    readonly circleStyle?: ResolvedAppearanceGraphSettings["circleStyle"] | undefined;
}

export interface ResolvedAppearanceThemeSettingsOverride {
    readonly selectedTheme?: MetricTheme | undefined;
    readonly terminal?: ResolvedTerminalThemeSettingsOverride | undefined;
}

export interface ResolvedTerminalThemeSettingsOverride {
    readonly variant?: TerminalThemeVariant | undefined;
}

export interface ResolvedAppearancePaintSettingsOverride {
    readonly metric?: ResolvedMetricPaintSettingsOverride | undefined;
    readonly colorFilled?: ResolvedColorFilledPaintSettingsOverride | undefined;
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

export interface ResolvedSparklineAppearanceSettingsOverride {
    readonly lineSmoothingPercent?: ResolvedSparklineAppearanceSettings["lineSmoothingPercent"] | undefined;
    readonly gridLineVisibility?: ResolvedSparklineAppearanceSettings["gridLineVisibility"] | undefined;
    readonly gridLineType?: ResolvedSparklineAppearanceSettings["gridLineType"] | undefined;
}

export function mergeResolvedAppearanceSettings(
    settings: ResolvedAppearanceSettings,
    override: ResolvedAppearanceSettingsOverride | undefined,
): ResolvedAppearanceSettings {
    if (!override) {
        return settings;
    }

    return {
        graph: {
            ...settings.graph,
            ...override.graph,
        },
        theme: {
            ...settings.theme,
            selectedTheme: override.theme?.selectedTheme ?? settings.theme.selectedTheme,
            terminal: {
                ...settings.theme.terminal,
                ...override.theme?.terminal,
            },
        },
        paint: mergeAppearancePaintSettings(settings.paint, override.paint),
        sparkline: {
            ...settings.sparkline,
            ...override.sparkline,
        },
    };
}

function mergeAppearancePaintSettings(
    paint: ResolvedAppearanceSettings["paint"],
    override: ResolvedAppearancePaintSettingsOverride | undefined,
): ResolvedAppearanceSettings["paint"] {
    return {
        metric: {
            ...paint.metric,
            ...override?.metric,
            solid: {
                ...paint.metric.solid,
                ...override?.metric?.solid,
                colors: {
                    ...paint.metric.solid.colors,
                    ...override?.metric?.solid?.colors,
                },
            },
            multiColor: {
                ...paint.metric.multiColor,
                ...override?.metric?.multiColor,
                colors: mergeMetricMultiColorChannelColors(
                    paint.metric.multiColor.colors,
                    override?.metric?.multiColor?.colors,
                ),
            },
        },
        colorFilled: {
            ...paint.colorFilled,
            ...override?.colorFilled,
            solid: {
                ...paint.colorFilled.solid,
                ...override?.colorFilled?.solid,
            },
            multiColor: {
                ...paint.colorFilled.multiColor,
                ...override?.colorFilled?.multiColor,
                colors: {
                    ...paint.colorFilled.multiColor.colors,
                    ...override?.colorFilled?.multiColor?.colors,
                },
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

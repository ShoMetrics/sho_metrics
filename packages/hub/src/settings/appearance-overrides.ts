import type {
    ColorMode,
    MetricTheme,
    ResolvedAppearanceGraphSettings,
    ResolvedAppearanceSettings,
    ResolvedMetricMultiColorChannelColors,
    ResolvedMetricMultiColorSettings,
    ResolvedMultiColorSet,
    ResolvedSparklineAppearanceSettings,
} from "./resolved-settings";

export type MetricColorChannel = keyof ResolvedMetricMultiColorChannelColors;

export interface ResolvedAppearanceSettingsOverride {
    readonly graph?: ResolvedAppearanceGraphSettingsOverride | undefined;
    readonly theme?: ResolvedAppearanceThemeSettingsOverride | undefined;
    readonly metricColor?: ResolvedMetricColorSettingsOverride | undefined;
    readonly sparkline?: ResolvedSparklineAppearanceSettingsOverride | undefined;
}

export interface ResolvedAppearanceGraphSettingsOverride {
    readonly viewLayout?: ResolvedAppearanceGraphSettings["viewLayout"] | undefined;
    readonly circleStyle?: ResolvedAppearanceGraphSettings["circleStyle"] | undefined;
}

export interface ResolvedAppearanceThemeSettingsOverride {
    readonly selectedTheme?: MetricTheme | undefined;
    readonly colorFilled?: ResolvedColorFilledThemeSettingsOverride | undefined;
}

export interface ResolvedColorFilledThemeSettingsOverride {
    readonly solid?: ResolvedColorFilledSolidSettingsOverride | undefined;
    readonly multiColor?: ResolvedColorFilledMultiColorSettingsOverride | undefined;
}

export interface ResolvedColorFilledSolidSettingsOverride {
    readonly color?: string | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedColorFilledMultiColorSettingsOverride {
    readonly colors?: ResolvedMultiColorSetOverride | undefined;
    readonly isGradientEnabled?: boolean | undefined;
}

export interface ResolvedMetricColorSettingsOverride {
    readonly colorMode?: ColorMode | undefined;
    readonly solid?: ResolvedMetricSolidColorSettingsOverride | undefined;
    readonly multiColor?: ResolvedMetricMultiColorSettingsOverride | undefined;
}

export interface ResolvedMetricSolidColorSettingsOverride {
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

export interface ResolvedMetricMultiColorSettingsOverride {
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
            colorFilled: {
                solid: {
                    ...settings.theme.colorFilled.solid,
                    ...override.theme?.colorFilled?.solid,
                },
                multiColor: {
                    ...settings.theme.colorFilled.multiColor,
                    ...override.theme?.colorFilled?.multiColor,
                    colors: {
                        ...settings.theme.colorFilled.multiColor.colors,
                        ...override.theme?.colorFilled?.multiColor?.colors,
                    },
                },
            },
        },
        metricColor: {
            ...settings.metricColor,
            ...override.metricColor,
            solid: {
                ...settings.metricColor.solid,
                ...override.metricColor?.solid,
                colors: {
                    ...settings.metricColor.solid.colors,
                    ...override.metricColor?.solid?.colors,
                },
            },
            multiColor: {
                ...settings.metricColor.multiColor,
                ...override.metricColor?.multiColor,
                colors: mergeMetricMultiColorChannelColors(
                    settings.metricColor.multiColor.colors,
                    override.metricColor?.multiColor?.colors,
                ),
            },
        },
        sparkline: {
            ...settings.sparkline,
            ...override.sparkline,
        },
    };
}

function mergeMetricMultiColorChannelColors(
    colors: ResolvedMetricMultiColorSettings["colors"],
    override: ResolvedMetricMultiColorSettingsOverride["colors"] | undefined,
): ResolvedMetricMultiColorSettings["colors"] {
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

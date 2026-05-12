import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import type { ResolvedAppearanceSettings, ResolvedColorRamp } from "./resolved-settings";

export type MetricVisualSettings = ResolvedAppearanceSettings;
export type AppearanceColorRampKey =
    | "usageColors"
    | "downloadColors"
    | "uploadColors"
    | "diskReadColors"
    | "diskWriteColors";
export type MetricVisualSettingsOverride =
    Partial<Omit<ResolvedAppearanceSettings, AppearanceColorRampKey>>
    & Partial<Record<AppearanceColorRampKey, Partial<ResolvedColorRamp>>>;

export interface ResolvedMetricVisualSettings {
    graphicType: ResolvedAppearanceSettings["viewLayout"];
    circleStyle: ArcGaugeStyle;
    graphicStyle: GraphicThemePresetName;
    colorConfig: ColorConfig;
    lineSmoothingPercent: number;
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
}

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

export function buildMetricVisualSettings(
    settings: ResolvedAppearanceSettings,
): ResolvedMetricVisualSettings {
    return {
        graphicType: settings.viewLayout,
        circleStyle: settings.circleStyle,
        graphicStyle: settings.theme,
        colorConfig: buildColorConfig(settings),
        lineSmoothingPercent: settings.lineSmoothingPercent,
        gridLineVisibility: settings.gridLineVisibility,
        gridLineType: settings.gridLineType,
    };
}

export function mergeMetricVisualSettings(
    settings: MetricVisualSettings,
    override: MetricVisualSettingsOverride | undefined,
): MetricVisualSettings {
    if (!override) {
        return settings;
    }

    return {
        ...settings,
        ...override,
        usageColors: mergeColorRamp(settings.usageColors, override.usageColors),
        downloadColors: mergeColorRamp(settings.downloadColors, override.downloadColors),
        uploadColors: mergeColorRamp(settings.uploadColors, override.uploadColors),
        diskReadColors: mergeColorRamp(settings.diskReadColors, override.diskReadColors),
        diskWriteColors: mergeColorRamp(settings.diskWriteColors, override.diskWriteColors),
    };
}

function buildColorConfig(settings: ResolvedAppearanceSettings): ColorConfig {
    const colors = settings.usageColors;

    return {
        mode: settings.colorMode,
        solidColor: colors.solidColor,
        thresholds: buildThresholds({
            lowThreshold: settings.lowColorThresholdPercent,
            highThreshold: settings.highColorThresholdPercent,
            lowColor: colors.lowColor,
            mediumColor: colors.mediumColor,
            highColor: colors.highColor,
        }),
    };
}

function mergeColorRamp(
    colors: ResolvedColorRamp,
    override: Partial<ResolvedColorRamp> | undefined,
): ResolvedColorRamp {
    return {
        ...colors,
        ...override,
    };
}

function buildThresholds(options: {
    lowThreshold: number;
    highThreshold: number;
    lowColor: string;
    mediumColor: string;
    highColor: string;
}): ColorThreshold[] {
    return [
        { min: MINIMUM_THRESHOLD, max: options.lowThreshold, color: options.lowColor },
        { min: options.lowThreshold, max: options.highThreshold, color: options.mediumColor },
        { min: options.highThreshold, max: MAXIMUM_THRESHOLD + 1, color: options.highColor },
    ];
}

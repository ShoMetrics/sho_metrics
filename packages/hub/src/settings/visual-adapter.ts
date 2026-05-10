import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import {
    type AppearanceSettings,
    type AppearanceSettingsOverride,
    type ColorRamp,
} from "./widget-settings";

export type MetricVisualSettings = AppearanceSettings;
export type MetricVisualSettingsOverride = AppearanceSettingsOverride;

export interface ResolvedMetricVisualSettings {
    graphicType: AppearanceSettings["graphicType"];
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
    settings: AppearanceSettings,
): ResolvedMetricVisualSettings {
    return {
        graphicType: settings.graphicType,
        circleStyle: settings.circleStyle,
        graphicStyle: settings.graphicStyle,
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

function buildColorConfig(settings: AppearanceSettings): ColorConfig {
    const colors = settings.usageColors;

    return {
        mode: settings.colorMode,
        solidColor: colors.solidColor,
        thresholds: buildThresholds({
            lowThreshold: settings.lowThreshold,
            highThreshold: settings.highThreshold,
            lowColor: colors.lowColor,
            mediumColor: colors.mediumColor,
            highColor: colors.highColor,
        }),
    };
}

function mergeColorRamp(colors: ColorRamp, override: Partial<ColorRamp> | undefined): ColorRamp {
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

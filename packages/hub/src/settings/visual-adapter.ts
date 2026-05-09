import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName, GraphicType } from "../widgets/widget.interface";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import {
    defaultAppearanceSettings,
    type AppearanceSettings,
    type AppearanceSettingsOverride,
    type ColorRamp,
} from "./widget-settings";

export type MetricVisualSettings = AppearanceSettings;
export type MetricVisualSettingsOverride = AppearanceSettingsOverride;

export interface ResolvedMetricVisualSettings {
    graphicType: GraphicType;
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
    const graphicType = resolveGraphicType(settings.graphicType);
    const graphicStyle = resolveGraphicStyle(settings.graphicStyle);

    return {
        graphicType,
        circleStyle: resolveCircleStyle(settings.circleStyle),
        graphicStyle,
        colorConfig: buildColorConfig(settings),
        lineSmoothingPercent: normalizePercentageSetting(
            settings.lineSmoothingPercent,
            defaultAppearanceSettings.lineSmoothingPercent,
        ),
        gridLineVisibility: resolveGridLineVisibility(settings.gridLineVisibility),
        gridLineType: resolveGridLineType(settings.gridLineType),
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

function resolveGraphicType(value: AppearanceSettings["graphicType"]): GraphicType {
    switch (value) {
        case "circular":
        case "text":
        case "linear":
        case "dashed-line":
            return value;
    }

    return defaultAppearanceSettings.graphicType;
}

function resolveCircleStyle(value: AppearanceSettings["circleStyle"]): ArcGaugeStyle {
    switch (value) {
        case "compact":
        case "gauge":
        case "value":
            return value;
    }

    return defaultAppearanceSettings.circleStyle;
}

function resolveGraphicStyle(value: AppearanceSettings["graphicStyle"]): GraphicThemePresetName {
    switch (value) {
        case "flat":
        case "cupertino-glass":
            return value;
    }

    return defaultAppearanceSettings.graphicStyle;
}

function resolveGridLineVisibility(value: AppearanceSettings["gridLineVisibility"]): SparklineGridLineVisibility {
    switch (value) {
        case "none":
        case "always":
        case "adaptive":
            return value;
    }

    return defaultAppearanceSettings.gridLineVisibility;
}

function resolveGridLineType(value: AppearanceSettings["gridLineType"]): SparklineGridLineType {
    return value === "vertical" ? "vertical" : defaultAppearanceSettings.gridLineType;
}

function buildColorConfig(settings: AppearanceSettings): ColorConfig {
    const colorMode = settings.colorMode === "solid" ? "solid" : "threshold";
    const { lowThreshold, highThreshold } = resolveThresholdPair(settings.lowThreshold, settings.highThreshold);
    const colors = settings.usageColors;

    return {
        mode: colorMode,
        solidColor: resolveColorSetting(colors.solidColor, defaultAppearanceSettings.usageColors.solidColor),
        thresholds: buildThresholds({
            lowThreshold,
            highThreshold,
            lowColor: resolveColorSetting(colors.lowColor, defaultAppearanceSettings.usageColors.lowColor),
            mediumColor: resolveColorSetting(colors.mediumColor, defaultAppearanceSettings.usageColors.mediumColor),
            highColor: resolveColorSetting(colors.highColor, defaultAppearanceSettings.usageColors.highColor),
        }),
    };
}

function mergeColorRamp(colors: ColorRamp, override: Partial<ColorRamp> | undefined): ColorRamp {
    return {
        ...colors,
        ...override,
    };
}

function resolveThresholdPair(
    lowThresholdValue: number,
    highThresholdValue: number,
): { lowThreshold: number; highThreshold: number } {
    const lowThreshold = resolveThresholdValue(lowThresholdValue, defaultAppearanceSettings.lowThreshold);
    const highThreshold = resolveThresholdValue(highThresholdValue, defaultAppearanceSettings.highThreshold);

    if (lowThreshold <= highThreshold) {
        return { lowThreshold, highThreshold };
    }

    return {
        lowThreshold: highThreshold,
        highThreshold: lowThreshold,
    };
}

function resolveThresholdValue(value: number, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.round(Math.min(Math.max(numericValue, MINIMUM_THRESHOLD), MAXIMUM_THRESHOLD));
}

function resolveColorSetting(value: string, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    const normalizedColor = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor : fallbackColor;
}

function normalizePercentageSetting(value: number, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.round(Math.min(Math.max(numericValue, MINIMUM_THRESHOLD), MAXIMUM_THRESHOLD));
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

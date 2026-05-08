import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName, GraphicType } from "../widgets/widget.interface";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import { defaultAppearanceSettings, type AppearanceSettings } from "../settings/widget-settings";

export type MetricVisualSettings = AppearanceSettings;
export type MetricVisualSettingsOverride = Partial<Pick<
    AppearanceSettings,
    | "graphicType"
    | "circleStyle"
    | "graphicStyle"
    | "colorMode"
    | "solidColor"
    | "lowThreshold"
    | "highThreshold"
    | "colorLow"
    | "colorMedium"
    | "colorHigh"
    | "lineSmoothingPercent"
    | "gridLineVisibility"
    | "gridLineType"
>>;

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

export function resolveMetricVisualSettings(
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

    return {
        mode: colorMode,
        solidColor: resolveColorSetting(settings.solidColor, defaultAppearanceSettings.solidColor),
        thresholds: buildThresholds({
            lowThreshold,
            highThreshold,
            lowColor: resolveColorSetting(settings.colorLow, defaultAppearanceSettings.colorLow),
            mediumColor: resolveColorSetting(settings.colorMedium, defaultAppearanceSettings.colorMedium),
            highColor: resolveColorSetting(settings.colorHigh, defaultAppearanceSettings.colorHigh),
        }),
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

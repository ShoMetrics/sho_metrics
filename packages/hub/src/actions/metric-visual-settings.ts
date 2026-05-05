import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName, GraphicType } from "../widgets/widget.interface";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";

export type SettingValue = string | number | boolean | null | undefined;

export interface MetricVisualSettings {
    graphicType?: SettingValue;
    graphicStyle?: SettingValue;
    colorMode?: SettingValue;
    solidColor?: SettingValue;
    lowThreshold?: SettingValue;
    highThreshold?: SettingValue;
    colorLow?: SettingValue;
    colorMedium?: SettingValue;
    colorMid?: SettingValue;
    colorHigh?: SettingValue;
    lineSmoothingPercent?: SettingValue;
    gridLineVisibility?: SettingValue;
    gridLineType?: SettingValue;
}

export interface ResolvedMetricVisualSettings {
    graphicType: GraphicType;
    graphicStyle: GraphicThemePresetName;
    colorConfig: ColorConfig;
    lineSmoothingPercent: number;
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
}

const DEFAULT_LOW_THRESHOLD = 30;
const DEFAULT_HIGH_THRESHOLD = 70;
const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

const DEFAULT_SOLID_COLOR = "#3b82f6";
const DEFAULT_LOW_COLOR = "#22c55e";
const DEFAULT_MEDIUM_COLOR = "#eab308";
const DEFAULT_HIGH_COLOR = "#ef4444";
const DEFAULT_LINE_SMOOTHING_PERCENT = 75;

const GRAPHIC_TYPE_ALIASES: Record<string, GraphicType> = {
    "arc-gauge": "circular",
    "linear-bar": "linear",
    "sparkline": "dashed-line",
    "circular": "circular",
    "linear": "linear",
    "dashed-line": "dashed-line",
};

const GRAPHIC_THEME_PRESET_NAMES: readonly GraphicThemePresetName[] = ["flat", "cupertino-glass"];

export function resolveMetricVisualSettings(settings: MetricVisualSettings): ResolvedMetricVisualSettings {
    const graphicType = resolveGraphicType(settings.graphicType);
    const graphicStyle = resolveGraphicStyle(settings.graphicStyle);

    return {
        graphicType,
        graphicStyle,
        colorConfig: buildColorConfig(settings),
        lineSmoothingPercent: normalizePercentageSetting(
            settings.lineSmoothingPercent,
            DEFAULT_LINE_SMOOTHING_PERCENT,
        ),
        gridLineVisibility: resolveGridLineVisibility(settings.gridLineVisibility),
        gridLineType: resolveGridLineType(settings.gridLineType),
    };
}

function resolveGraphicType(value: SettingValue): GraphicType {
    if (typeof value !== "string") {
        return "circular";
    }

    return GRAPHIC_TYPE_ALIASES[value] ?? "circular";
}

function resolveGraphicStyle(value: SettingValue): GraphicThemePresetName {
    if (GRAPHIC_THEME_PRESET_NAMES.includes(value as GraphicThemePresetName)) {
        return value as GraphicThemePresetName;
    }

    return "flat";
}

function resolveGridLineVisibility(value: SettingValue): SparklineGridLineVisibility {
    if (value === "none") {
        return "none";
    }

    if (value === "always") {
        return "always";
    }

    return "adaptive";
}

function resolveGridLineType(value: SettingValue): SparklineGridLineType {
    return value === "vertical" ? "vertical" : "horizontal";
}

function buildColorConfig(settings: MetricVisualSettings): ColorConfig {
    const colorMode = settings.colorMode === "solid" ? "solid" : "threshold";
    const { lowThreshold, highThreshold } = resolveThresholdPair(settings.lowThreshold, settings.highThreshold);

    return {
        mode: colorMode,
        solidColor: resolveColorSetting(settings.solidColor, DEFAULT_SOLID_COLOR),
        thresholds: buildThresholds({
            lowThreshold,
            highThreshold,
            lowColor: resolveColorSetting(settings.colorLow, DEFAULT_LOW_COLOR),
            mediumColor: resolveColorSetting(settings.colorMedium ?? settings.colorMid, DEFAULT_MEDIUM_COLOR),
            highColor: resolveColorSetting(settings.colorHigh, DEFAULT_HIGH_COLOR),
        }),
    };
}

function resolveThresholdPair(
    lowThresholdValue: SettingValue,
    highThresholdValue: SettingValue,
): { lowThreshold: number; highThreshold: number } {
    const lowThreshold = resolveThresholdValue(lowThresholdValue, DEFAULT_LOW_THRESHOLD);
    const highThreshold = resolveThresholdValue(highThresholdValue, DEFAULT_HIGH_THRESHOLD);

    if (lowThreshold <= highThreshold) {
        return { lowThreshold, highThreshold };
    }

    return {
        lowThreshold: highThreshold,
        highThreshold: lowThreshold,
    };
}

function resolveThresholdValue(value: SettingValue, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.round(Math.min(Math.max(numericValue, MINIMUM_THRESHOLD), MAXIMUM_THRESHOLD));
}

function resolveColorSetting(value: SettingValue, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    const normalizedColor = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor : fallbackColor;
}

function normalizePercentageSetting(value: SettingValue, fallbackValue: number): number {
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

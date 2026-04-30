import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicStyleName, GraphicType } from "../widgets/widget.interface";

export interface MetricVisualSettings {
    graphicType?: unknown;
    graphicStyle?: unknown;
    colorMode?: unknown;
    solidColor?: unknown;
    lowThreshold?: unknown;
    highThreshold?: unknown;
    colorLow?: unknown;
    colorMedium?: unknown;
    colorMid?: unknown;
    colorHigh?: unknown;
}

export interface ResolvedMetricVisualSettings {
    graphicType: GraphicType;
    graphicStyle: GraphicStyleName;
    colorConfig: ColorConfig;
}

const DEFAULT_LOW_THRESHOLD = 30;
const DEFAULT_HIGH_THRESHOLD = 70;
const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

const DEFAULT_SOLID_COLOR = "#3b82f6";
const DEFAULT_LOW_COLOR = "#22c55e";
const DEFAULT_MEDIUM_COLOR = "#eab308";
const DEFAULT_HIGH_COLOR = "#ef4444";

const GRAPHIC_TYPE_ALIASES: Record<string, GraphicType> = {
    "arc-gauge": "circular",
    "linear-bar": "linear",
    "sparkline": "dashed-line",
    "circular": "circular",
    "linear": "linear",
    "dashed-line": "dashed-line",
};

const GRAPHIC_STYLES: readonly GraphicStyleName[] = ["flat", "cupertino-glass"];

export function resolveMetricVisualSettings(settings: MetricVisualSettings): ResolvedMetricVisualSettings {
    const graphicType = resolveGraphicType(settings.graphicType);
    const graphicStyle = resolveGraphicStyle(settings.graphicStyle);

    return {
        graphicType,
        graphicStyle,
        colorConfig: buildColorConfig(settings),
    };
}

function resolveGraphicType(value: unknown): GraphicType {
    if (typeof value !== "string") {
        return "circular";
    }

    return GRAPHIC_TYPE_ALIASES[value] ?? "circular";
}

function resolveGraphicStyle(value: unknown): GraphicStyleName {
    if (GRAPHIC_STYLES.includes(value as GraphicStyleName)) {
        return value as GraphicStyleName;
    }

    return "flat";
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
    lowThresholdValue: unknown,
    highThresholdValue: unknown,
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

function resolveThresholdValue(value: unknown, fallbackValue: number): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.round(Math.min(Math.max(numericValue, MINIMUM_THRESHOLD), MAXIMUM_THRESHOLD));
}

function resolveColorSetting(value: unknown, fallbackColor: string): string {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    const normalizedColor = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor : fallbackColor;
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

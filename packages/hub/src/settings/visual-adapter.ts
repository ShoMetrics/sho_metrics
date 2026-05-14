import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { SparklineGridLineType, SparklineGridLineVisibility } from "../widgets/primitives/sparkline";
import type { ColorMode, ResolvedAppearanceSettings, ResolvedColorRamp } from "./resolved-settings";

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

export type RenderPaintConstraint = "none" | "black-white";

export interface RenderPaintTokens {
    readonly background: string;
    readonly surface: string;
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly primaryMetric: ColorConfig;
    readonly track: string;
    readonly grid: string;
    readonly divider: string;
}

export interface ResolvedMetricVisualSettings {
    graphicType: ResolvedAppearanceSettings["viewLayout"];
    circleStyle: ArcGaugeStyle;
    graphicStyle: GraphicThemePresetName;
    paintConstraint: RenderPaintConstraint;
    paints: RenderPaintTokens;
    lineSmoothingPercent: number;
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
}

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;
const BLACK_WHITE_PAINT = "#e6e6e6";

export function buildMetricVisualSettings(
    settings: ResolvedAppearanceSettings,
): ResolvedMetricVisualSettings {
    const colorConfig = buildColorConfigFromRamp({
        colorMode: settings.colorMode,
        colors: settings.usageColors,
        lowThreshold: settings.lowColorThresholdPercent,
        highThreshold: settings.highColorThresholdPercent,
    });

    return {
        graphicType: settings.viewLayout,
        circleStyle: settings.circleStyle,
        graphicStyle: settings.theme,
        paintConstraint: settings.colorMode === "black-white" ? "black-white" : "none",
        paints: buildRenderPaintTokens(colorConfig),
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

export function buildColorConfigFromRamp(options: {
    readonly colorMode: ColorMode;
    readonly colors: ResolvedColorRamp;
    readonly lowThreshold: number;
    readonly highThreshold: number;
}): ColorConfig {
    const colorConfigMode = options.colorMode === "solid" ? "solid" : "threshold";
    const baseColorConfig: ColorConfig = {
        mode: colorConfigMode,
        solidColor: options.colors.solidColor,
        thresholds: buildThresholds({
            lowThreshold: options.lowThreshold,
            highThreshold: options.highThreshold,
            lowColor: options.colors.lowColor,
            mediumColor: options.colors.mediumColor,
            highColor: options.colors.highColor,
        }),
    };

    return lowerColorConfigForColorMode(options.colorMode, baseColorConfig);
}

export function resolveSolidVisualOverrideColorMode(colorMode: ColorMode): ColorMode {
    return colorMode === "black-white" ? "black-white" : "solid";
}

function lowerColorConfigForColorMode(colorMode: ColorMode, colorConfig: ColorConfig): ColorConfig {
    if (colorMode !== "black-white") {
        return colorConfig;
    }

    return {
        mode: "solid",
        solidColor: BLACK_WHITE_PAINT,
        thresholds: [],
    };
}

function buildRenderPaintTokens(primaryMetric: ColorConfig): RenderPaintTokens {
    return {
        background: "#0f0f0f",
        surface: "rgba(255,255,255,0.08)",
        primaryText: "rgba(255,255,255,0.94)",
        secondaryText: "rgba(255,255,255,0.72)",
        mutedText: "rgba(255,255,255,0.48)",
        icon: "rgba(255,255,255,0.88)",
        primaryMetric,
        track: "rgba(255,255,255,0.14)",
        grid: "rgba(255,255,255,0.18)",
        divider: "rgba(255,255,255,0.18)",
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

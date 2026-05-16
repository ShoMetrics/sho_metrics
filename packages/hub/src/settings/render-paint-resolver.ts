import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type {
    RenderBackgroundFill,
    RenderPaintConstraint,
    RenderPaintTokens,
} from "../rendering/render-appearance";
import type { MetricColorChannel } from "./appearance-overrides";
import type {
    ColorMode,
    ResolvedAppearanceSettings,
    ResolvedMetricPaintSettings,
    ResolvedMetricSolidChannelColors,
} from "./resolved-settings";

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;
const BLACK_WHITE_PAINT = "#e6e6e6";
const DEFAULT_BACKGROUND_PAINT = "#0f0f0f";
const BLACK_WHITE_SOLID_BACKGROUND_PAINT = "#222222";
const BLACK_WHITE_SOFT_TRIANGLE_LOW_PAINT = "#161616";
const BLACK_WHITE_SOFT_TRIANGLE_MEDIUM_PAINT = "#2c2c2c";
const BLACK_WHITE_SOFT_TRIANGLE_HIGH_PAINT = "#444444";
const OLD_CRT_BLACK_GLASS_PAINT = "#010301";
const OLD_CRT_BRIGHT_CORE_PAINT = "#e2ff98";
const OLD_CRT_NORMAL_PHOSPHOR_PAINT = "#a7f53a";
const OLD_CRT_DIM_PHOSPHOR_PAINT = "rgba(167,245,58,0.42)";

const DEFAULT_RENDER_PAINT_TOKENS = {
    background: DEFAULT_BACKGROUND_PAINT,
    surface: "rgba(255,255,255,0.08)",
    primaryText: "rgba(255,255,255,0.94)",
    secondaryText: "rgba(255,255,255,0.72)",
    mutedText: "rgba(255,255,255,0.48)",
    icon: "rgba(255,255,255,0.88)",
    linearTitleText: "rgba(255,255,255,0.88)",
    linearValueText: "white",
    linearUnitText: "rgba(255,255,255,0.76)",
    linearSecondaryText: "rgba(255,255,255,0.78)",
    track: "rgba(255,255,255,0.14)",
    grid: "rgba(255,255,255,0.18)",
    divider: "rgba(255,255,255,0.18)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

const OLD_CRT_RENDER_PAINT_TOKENS = {
    background: OLD_CRT_BLACK_GLASS_PAINT,
    surface: "rgba(167,245,58,0.24)",
    primaryText: OLD_CRT_BRIGHT_CORE_PAINT,
    secondaryText: "rgba(167,245,58,0.76)",
    mutedText: OLD_CRT_DIM_PHOSPHOR_PAINT,
    icon: "rgba(167,245,58,0.82)",
    linearTitleText: "rgba(167,245,58,0.74)",
    linearValueText: OLD_CRT_BRIGHT_CORE_PAINT,
    linearUnitText: "rgba(167,245,58,0.70)",
    linearSecondaryText: OLD_CRT_DIM_PHOSPHOR_PAINT,
    track: "rgba(167,245,58,0.16)",
    grid: "rgba(167,245,58,0.26)",
    divider: "rgba(167,245,58,0.22)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

const OLD_CRT_COLOR_CONFIG = {
    mode: "solid",
    solidColor: OLD_CRT_NORMAL_PHOSPHOR_PAINT,
    thresholds: [],
    isGradientEnabled: false,
} satisfies ColorConfig;

const solidColorKeyByChannel = {
    usage: "usageColor",
    download: "downloadColor",
    upload: "uploadColor",
    diskRead: "diskReadColor",
    diskWrite: "diskWriteColor",
} satisfies Record<MetricColorChannel, keyof ResolvedMetricSolidChannelColors>;

export function resolveRenderPaint(settings: ResolvedAppearanceSettings): {
    readonly paintConstraint: RenderPaintConstraint;
    readonly paintTokens: RenderPaintTokens;
} {
    const paintConstraint = activePaintColorMode(settings) === "black-white" ? "black-white" : "none";

    return {
        paintConstraint,
        paintTokens: buildRenderPaintTokens(settings, paintConstraint),
    };
}

export function buildColorConfigFromAppearance(
    appearance: ResolvedAppearanceSettings,
    channel: MetricColorChannel,
): ColorConfig {
    const colorConfig = buildColorConfigFromMetricPaint(appearance.paint.metric, channel);

    if (appearance.theme.selectedTheme !== "color-filled") {
        if (appearance.theme.selectedTheme === "old-crt") {
            return lowerColorConfigForColorMode(appearance.paint.metric.colorMode, OLD_CRT_COLOR_CONFIG);
        }

        return colorConfig;
    }

    return {
        mode: "solid",
        solidColor: BLACK_WHITE_PAINT,
        thresholds: [],
        isGradientEnabled: false,
    };
}

export function resolveSolidMetricColorMode(colorMode: ColorMode): ColorMode {
    return colorMode === "black-white" ? "black-white" : "solid";
}

function buildColorConfigFromMetricPaint(
    metricPaint: ResolvedMetricPaintSettings,
    channel: MetricColorChannel,
): ColorConfig {
    const solidColorKey = solidColorKeyByChannel[channel];
    const colorConfigMode = metricPaint.colorMode === "solid" ? "solid" : "threshold";
    const multiColor = metricPaint.multiColor.colors[channel];
    const isGradientEnabled = metricPaint.colorMode === "solid"
        ? metricPaint.solid.isGradientEnabled
        : metricPaint.multiColor.isGradientEnabled;
    const baseColorConfig: ColorConfig = {
        mode: colorConfigMode,
        solidColor: metricPaint.solid.colors[solidColorKey],
        thresholds: buildThresholds({
            lowThreshold: metricPaint.multiColor.lowThresholdPercent,
            highThreshold: metricPaint.multiColor.highThresholdPercent,
            lowColor: multiColor.lowColor,
            mediumColor: multiColor.mediumColor,
            highColor: multiColor.highColor,
        }),
        isGradientEnabled,
    };

    return lowerColorConfigForColorMode(metricPaint.colorMode, baseColorConfig);
}

function lowerColorConfigForColorMode(colorMode: ColorMode, colorConfig: ColorConfig): ColorConfig {
    if (colorMode !== "black-white") {
        return colorConfig;
    }

    return {
        mode: "solid",
        solidColor: BLACK_WHITE_PAINT,
        thresholds: [],
        isGradientEnabled: false,
    };
}

function buildRenderPaintTokens(
    settings: ResolvedAppearanceSettings,
    paintConstraint: RenderPaintConstraint,
): RenderPaintTokens {
    const primaryMetric = buildColorConfigFromAppearance(settings, "usage");
    const backgroundFill = buildRenderBackgroundFill(settings);

    if (paintConstraint === "black-white") {
        return {
            ...DEFAULT_RENDER_PAINT_TOKENS,
            backgroundFill: lowerBackgroundFillToBlackWhite(backgroundFill),
            primaryMetric,
        };
    }

    if (settings.theme.selectedTheme === "old-crt") {
        return {
            ...OLD_CRT_RENDER_PAINT_TOKENS,
            backgroundFill: undefined,
            primaryMetric,
        };
    }

    return {
        ...DEFAULT_RENDER_PAINT_TOKENS,
        backgroundFill,
        primaryMetric,
    };
}

function buildRenderBackgroundFill(settings: ResolvedAppearanceSettings): RenderBackgroundFill | undefined {
    if (settings.theme.selectedTheme !== "color-filled") {
        return undefined;
    }

    const colorFilledPaint = settings.paint.colorFilled;

    if (colorFilledPaint.colorMode === "solid") {
        return {
            fillKind: "solid",
            color: colorFilledPaint.solid.color,
            isGradientEnabled: colorFilledPaint.solid.isGradientEnabled,
        };
    }

    return {
        fillKind: "soft-triangle",
        lowColor: colorFilledPaint.multiColor.colors.lowColor,
        mediumColor: colorFilledPaint.multiColor.colors.mediumColor,
        highColor: colorFilledPaint.multiColor.colors.highColor,
        isGradientEnabled: colorFilledPaint.multiColor.isGradientEnabled,
    };
}

function activePaintColorMode(settings: ResolvedAppearanceSettings): ColorMode {
    if (settings.theme.selectedTheme === "color-filled") {
        return settings.paint.colorFilled.colorMode;
    }

    return settings.paint.metric.colorMode;
}

function lowerBackgroundFillToBlackWhite(backgroundFill: RenderBackgroundFill | undefined): RenderBackgroundFill | undefined {
    if (!backgroundFill) {
        return undefined;
    }

    if (backgroundFill.fillKind === "solid") {
        return {
            ...backgroundFill,
            color: BLACK_WHITE_SOLID_BACKGROUND_PAINT,
        };
    }

    return {
        ...backgroundFill,
        lowColor: BLACK_WHITE_SOFT_TRIANGLE_LOW_PAINT,
        mediumColor: BLACK_WHITE_SOFT_TRIANGLE_MEDIUM_PAINT,
        highColor: BLACK_WHITE_SOFT_TRIANGLE_HIGH_PAINT,
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

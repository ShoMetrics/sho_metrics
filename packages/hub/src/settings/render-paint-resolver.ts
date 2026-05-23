import type { ColorConfig, ColorThreshold } from "../view-rendering/color-resolver";
import type {
    RenderBackgroundFill,
    RenderPaintConstraint,
    RenderPaintTokens,
} from "../view-rendering/render-appearance";
import type { MetricColorChannel } from "./appearance-overrides";
import type {
    ColorMode,
    ResolvedAppearanceSettings,
    ResolvedColorFilledPaintSettings,
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
const TERMINAL_CLEAN_BLACK_GLASS_PAINT = "#010705";
const TERMINAL_CLEAN_BRIGHT_CORE_PAINT = "#67ff70";
const TERMINAL_CLEAN_NORMAL_PHOSPHOR_PAINT = "#25e84a";
const TERMINAL_CLEAN_DIM_PHOSPHOR_PAINT = "rgba(37,232,74,0.54)";
const TERMINAL_VINTAGE_BLACK_GLASS_PAINT = "#010301";
const TERMINAL_VINTAGE_BRIGHT_CORE_PAINT = "#46ff36";
const TERMINAL_VINTAGE_NORMAL_PHOSPHOR_PAINT = "#10d82a";
const TERMINAL_VINTAGE_DIM_PHOSPHOR_PAINT = "rgba(1,174,31,0.44)";

const DEFAULT_RENDER_PAINT_TOKENS = {
    background: DEFAULT_BACKGROUND_PAINT,
    surface: "rgba(255,255,255,0.08)",
    primaryText: "rgba(255,255,255,0.94)",
    secondaryText: "rgba(255,255,255,0.72)",
    mutedText: "rgba(255,255,255,0.48)",
    icon: "rgba(255,255,255,0.88)",
    barTitleText: "rgba(255,255,255,0.88)",
    barValueText: "white",
    barUnitText: "rgba(255,255,255,0.76)",
    barSecondaryText: "rgba(255,255,255,0.78)",
    track: "rgba(255,255,255,0.14)",
    grid: "rgba(255,255,255,0.18)",
    divider: "rgba(255,255,255,0.18)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

const TERMINAL_CLEAN_RENDER_PAINT_TOKENS = {
    background: TERMINAL_CLEAN_BLACK_GLASS_PAINT,
    surface: TERMINAL_CLEAN_NORMAL_PHOSPHOR_PAINT,
    primaryText: TERMINAL_CLEAN_BRIGHT_CORE_PAINT,
    secondaryText: "rgba(37,232,74,0.82)",
    mutedText: TERMINAL_CLEAN_DIM_PHOSPHOR_PAINT,
    icon: "rgba(37,232,74,0.88)",
    barTitleText: "rgba(37,232,74,0.80)",
    barValueText: TERMINAL_CLEAN_BRIGHT_CORE_PAINT,
    barUnitText: "rgba(37,232,74,0.78)",
    barSecondaryText: TERMINAL_CLEAN_DIM_PHOSPHOR_PAINT,
    track: "rgba(37,232,74,0.17)",
    grid: "rgba(37,232,74,0.18)",
    divider: "rgba(37,232,74,0.18)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

const TERMINAL_VINTAGE_RENDER_PAINT_TOKENS = {
    background: TERMINAL_VINTAGE_BLACK_GLASS_PAINT,
    surface: TERMINAL_VINTAGE_NORMAL_PHOSPHOR_PAINT,
    primaryText: TERMINAL_VINTAGE_BRIGHT_CORE_PAINT,
    secondaryText: "rgba(16,216,42,0.78)",
    mutedText: TERMINAL_VINTAGE_DIM_PHOSPHOR_PAINT,
    icon: "rgba(16,216,42,0.84)",
    barTitleText: "rgba(16,216,42,0.76)",
    barValueText: TERMINAL_VINTAGE_BRIGHT_CORE_PAINT,
    barUnitText: "rgba(16,216,42,0.72)",
    barSecondaryText: TERMINAL_VINTAGE_DIM_PHOSPHOR_PAINT,
    track: "rgba(1,160,30,0.18)",
    grid: "rgba(1,198,39,0.28)",
    divider: "rgba(1,198,39,0.24)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

const TERMINAL_CLEAN_COLOR_CONFIG = {
    mode: "solid",
    solidColor: TERMINAL_CLEAN_NORMAL_PHOSPHOR_PAINT,
    thresholds: [],
    isGradientEnabled: false,
} satisfies ColorConfig;

const TERMINAL_VINTAGE_COLOR_CONFIG = {
    mode: "solid",
    solidColor: TERMINAL_VINTAGE_NORMAL_PHOSPHOR_PAINT,
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

/**
 * Resolves renderer paint tokens and the active paint constraint from appearance settings.
 *
 * Used before SVG composition so renderers consume theme semantics without
 * reading theme-scoped settings paths directly.
 */
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

/**
 * Builds a renderer color config for one metric channel from the active theme paint.
 *
 * Used by widgets and domain view builders to color rings, bars, lines, and
 * channel accents without knowing where each theme stores its paint settings.
 */
export function buildColorConfigFromAppearance(
    appearance: ResolvedAppearanceSettings,
    channel: MetricColorChannel,
): ColorConfig {
    switch (appearance.theme.selectedTheme) {
        case "flat":
            return buildColorConfigFromMetricPaint(appearance.theme.flat.paint, channel);
        case "cupertino-glass":
            return buildColorConfigFromMetricPaint(appearance.theme.cupertinoGlass.paint, channel);
        case "color-filled":
            return {
                mode: "solid",
                solidColor: BLACK_WHITE_PAINT,
                thresholds: [],
                isGradientEnabled: false,
            };
        case "terminal":
            return terminalColorConfigForVariant(appearance.theme.terminal.variant);
    }
}

/**
 * Resolves the equivalent solid-only metric accent mode.
 *
 * Used by dual-channel metric views that choose per-channel colors in action
 * code while preserving the user's Black & White choice.
 */
export function resolveSolidMetricColorMode(colorMode: ColorMode | undefined): ColorMode | undefined {
    if (colorMode === undefined) {
        return undefined;
    }

    return colorMode === "black-white" ? "black-white" : "solid";
}

/**
 * Resolves the active theme's metric accent paint when the theme has one.
 *
 * Used by Property Inspector color controls that should disappear for themes
 * such as Color Filled or Terminal where the same controls would edit the
 * wrong visual object.
 */
export function resolveActiveMetricAccentPaint(
    appearance: ResolvedAppearanceSettings,
): ResolvedMetricPaintSettings | undefined {
    switch (appearance.theme.selectedTheme) {
        case "flat":
            return appearance.theme.flat.paint;
        case "cupertino-glass":
            return appearance.theme.cupertinoGlass.paint;
        case "color-filled":
        case "terminal":
            return undefined;
    }
}

/**
 * Resolves Color Filled paint when Color Filled is the active theme.
 *
 * Used by Property Inspector controls where color mode edits the widget
 * background rather than the foreground metric accent.
 */
export function resolveActiveColorFilledPaint(
    appearance: ResolvedAppearanceSettings,
): ResolvedColorFilledPaintSettings | undefined {
    if (appearance.theme.selectedTheme !== "color-filled") {
        return undefined;
    }

    return appearance.theme.colorFilled.paint;
}

/**
 * Resolves the active theme's metric accent color mode when the theme has one.
 *
 * Used by domain view builders that need to preserve Black & White while
 * constructing temporary per-channel accent overrides.
 */
export function resolveActiveMetricAccentColorMode(appearance: ResolvedAppearanceSettings): ColorMode | undefined {
    return resolveActiveMetricAccentPaint(appearance)?.colorMode;
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

    if (settings.theme.selectedTheme === "terminal") {
        return {
            ...terminalRenderPaintTokensForVariant(settings.theme.terminal.variant),
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

function terminalColorConfigForVariant(
    variant: ResolvedAppearanceSettings["theme"]["terminal"]["variant"],
): ColorConfig {
    return variant === "vintage" ? TERMINAL_VINTAGE_COLOR_CONFIG : TERMINAL_CLEAN_COLOR_CONFIG;
}

function terminalRenderPaintTokensForVariant(
    variant: ResolvedAppearanceSettings["theme"]["terminal"]["variant"],
): Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric"> {
    return variant === "vintage" ? TERMINAL_VINTAGE_RENDER_PAINT_TOKENS : TERMINAL_CLEAN_RENDER_PAINT_TOKENS;
}

function buildRenderBackgroundFill(settings: ResolvedAppearanceSettings): RenderBackgroundFill | undefined {
    if (settings.theme.selectedTheme !== "color-filled") {
        return undefined;
    }

    const colorFilledPaint = settings.theme.colorFilled.paint;

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
    switch (settings.theme.selectedTheme) {
        case "flat":
            return settings.theme.flat.paint.colorMode;
        case "cupertino-glass":
            return settings.theme.cupertinoGlass.paint.colorMode;
        case "color-filled":
            return settings.theme.colorFilled.paint.colorMode;
        case "terminal":
            return "solid";
    }
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

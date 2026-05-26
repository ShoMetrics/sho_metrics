import type { ColorConfig, ColorThreshold } from "../view-rendering/color-resolver";
import type {
    RenderBackgroundFill,
    RenderPaintConstraint,
    RenderPaintTokens,
} from "../view-rendering/render-appearance";
import { DEFAULT_PIXEL_WINDOW_PALETTE } from "../view-rendering/pixel-window-theme-tokens";
import type { MetricColorChannel } from "./appearance-overrides";
import type {
    ColorMode,
    ResolvedAppearanceSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedMetricPaintSettings,
    ResolvedMetricSolidChannelColors,
    ResolvedTerminalPaintSettings,
    ResolvedTerminalThemeSettings,
    TerminalPalettePreset,
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
const TERMINAL_VINTAGE_BLACK_GLASS_PAINT = "#010301";

interface TerminalPaletteVariantPaints {
    readonly bright: string;
    readonly normal: string;
    readonly rgbChannels: string;
    readonly dimRgbChannels?: string | undefined;
    readonly trackRgbChannels?: string | undefined;
    readonly gridRgbChannels?: string | undefined;
}

const TERMINAL_PALETTE_PAINTS = {
    green: {
        clean: {
            bright: "#67ff70",
            normal: "#25e84a",
            rgbChannels: "37,232,74",
        },
        vintage: {
            bright: "#46ff36",
            normal: "#10d82a",
            rgbChannels: "16,216,42",
            dimRgbChannels: "1,174,31",
            trackRgbChannels: "1,160,30",
            gridRgbChannels: "1,198,39",
        },
    },
    amber: {
        clean: {
            bright: "#ffd166",
            normal: "#ffb000",
            rgbChannels: "255,176,0",
        },
        vintage: {
            bright: "#ffc247",
            normal: "#e69f00",
            rgbChannels: "230,159,0",
            dimRgbChannels: "194,128,0",
            trackRgbChannels: "190,124,0",
            gridRgbChannels: "220,145,0",
        },
    },
    cyan: {
        clean: {
            bright: "#67e8f9",
            normal: "#22d3ee",
            rgbChannels: "34,211,238",
        },
        vintage: {
            bright: "#5eead4",
            normal: "#00b8d8",
            rgbChannels: "0,184,216",
            dimRgbChannels: "0,145,178",
            trackRgbChannels: "0,132,166",
            gridRgbChannels: "0,170,205",
        },
    },
    white: {
        clean: {
            bright: "#ffffff",
            normal: "#e6e6e6",
            rgbChannels: "230,230,230",
        },
        vintage: {
            bright: "#f5f5f5",
            normal: "#cfcfcf",
            rgbChannels: "207,207,207",
            dimRgbChannels: "174,174,174",
            trackRgbChannels: "156,156,156",
            gridRgbChannels: "190,190,190",
        },
    },
} satisfies Record<TerminalPalettePreset, Record<ResolvedTerminalThemeSettings["variant"], TerminalPaletteVariantPaints>>;

const DEFAULT_RENDER_PAINT_TOKENS = {
    background: DEFAULT_BACKGROUND_PAINT,
    surface: "rgba(255,255,255,0.08)",
    primaryText: "rgba(255,255,255,0.94)",
    secondaryText: "rgba(255,255,255,0.72)",
    mutedText: "rgba(255,255,255,0.48)",
    icon: "rgba(255,255,255,0.88)",
    barTitleText: "rgba(255,255,255,0.88)",
    metricValueText: "white",
    barValueText: "white",
    barUnitText: "rgba(255,255,255,0.76)",
    barSecondaryText: "rgba(255,255,255,0.78)",
    track: "rgba(255,255,255,0.14)",
    grid: "rgba(255,255,255,0.18)",
    divider: "rgba(255,255,255,0.18)",
} satisfies Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric">;

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
            return terminalColorConfig(appearance.theme.terminal);
        case "pixel-window":
            return pixelWindowColorConfig();
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
        case "pixel-window":
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
 * Resolves Terminal paint when Terminal is the active theme.
 *
 * Used by Property Inspector controls where palette changes should affect the
 * terminal phosphor treatment instead of ordinary metric accent colors.
 */
export function resolveActiveTerminalPaint(
    appearance: ResolvedAppearanceSettings,
): ResolvedTerminalPaintSettings | undefined {
    if (appearance.theme.selectedTheme !== "terminal") {
        return undefined;
    }

    return appearance.theme.terminal.paint;
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
            ...terminalRenderPaintTokens(settings.theme.terminal),
            backgroundFill: undefined,
            primaryMetric,
        };
    }

    if (settings.theme.selectedTheme === "pixel-window") {
        return {
            ...pixelWindowRenderPaintTokens(),
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

function pixelWindowColorConfig(): ColorConfig {
    return {
        mode: "solid",
        solidColor: DEFAULT_PIXEL_WINDOW_PALETTE.bodyAccent,
        thresholds: [],
        isGradientEnabled: false,
    };
}

function pixelWindowRenderPaintTokens(): Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric"> {
    return {
        background: DEFAULT_PIXEL_WINDOW_PALETTE.clientBackground,
        surface: DEFAULT_PIXEL_WINDOW_PALETTE.bodySurface,
        primaryText: DEFAULT_PIXEL_WINDOW_PALETTE.bodyText,
        secondaryText: DEFAULT_PIXEL_WINDOW_PALETTE.bodySubtleText,
        mutedText: DEFAULT_PIXEL_WINDOW_PALETTE.bodyMutedText,
        icon: DEFAULT_PIXEL_WINDOW_PALETTE.bodyAccent,
        barTitleText: DEFAULT_PIXEL_WINDOW_PALETTE.bodyText,
        metricValueText: DEFAULT_PIXEL_WINDOW_PALETTE.bodyText,
        barValueText: DEFAULT_PIXEL_WINDOW_PALETTE.bodyText,
        barUnitText: DEFAULT_PIXEL_WINDOW_PALETTE.bodySubtleText,
        barSecondaryText: DEFAULT_PIXEL_WINDOW_PALETTE.bodySubtleText,
        track: DEFAULT_PIXEL_WINDOW_PALETTE.bodyTrack,
        grid: DEFAULT_PIXEL_WINDOW_PALETTE.bodyGrid,
        divider: DEFAULT_PIXEL_WINDOW_PALETTE.bodyDivider,
    };
}

function terminalColorConfig(terminal: ResolvedTerminalThemeSettings): ColorConfig {
    return {
        mode: "solid",
        solidColor: terminalPalettePaints(terminal).normal,
        thresholds: [],
        isGradientEnabled: false,
    };
}

function terminalRenderPaintTokens(
    terminal: ResolvedTerminalThemeSettings,
): Omit<RenderPaintTokens, "backgroundFill" | "primaryMetric"> {
    const paints = terminalPalettePaints(terminal);
    const dimRgbChannels = paints.dimRgbChannels ?? paints.rgbChannels;
    const trackRgbChannels = paints.trackRgbChannels ?? paints.rgbChannels;
    const gridRgbChannels = paints.gridRgbChannels ?? paints.rgbChannels;

    if (terminal.variant === "vintage") {
        const dimPhosphorPaint = rgba(dimRgbChannels, 0.44);

        return {
            background: TERMINAL_VINTAGE_BLACK_GLASS_PAINT,
            surface: paints.normal,
            primaryText: paints.bright,
            secondaryText: rgba(paints.rgbChannels, 0.78),
            mutedText: dimPhosphorPaint,
            icon: rgba(paints.rgbChannels, 0.84),
            barTitleText: rgba(paints.rgbChannels, 0.76),
            metricValueText: "white",
            barValueText: paints.bright,
            barUnitText: rgba(paints.rgbChannels, 0.72),
            barSecondaryText: dimPhosphorPaint,
            track: rgba(trackRgbChannels, 0.18),
            grid: rgba(gridRgbChannels, 0.28),
            divider: rgba(gridRgbChannels, 0.24),
        };
    }

    const dimPhosphorPaint = rgba(dimRgbChannels, 0.54);

    return {
        background: TERMINAL_CLEAN_BLACK_GLASS_PAINT,
        surface: paints.normal,
        primaryText: paints.bright,
        secondaryText: rgba(paints.rgbChannels, 0.82),
        mutedText: dimPhosphorPaint,
        icon: rgba(paints.rgbChannels, 0.88),
        barTitleText: rgba(paints.rgbChannels, 0.80),
        metricValueText: "white",
        barValueText: paints.bright,
        barUnitText: rgba(paints.rgbChannels, 0.78),
        barSecondaryText: dimPhosphorPaint,
        track: rgba(trackRgbChannels, 0.17),
        grid: rgba(gridRgbChannels, 0.18),
        divider: rgba(gridRgbChannels, 0.18),
    };
}

function terminalPalettePaints(terminal: ResolvedTerminalThemeSettings): TerminalPaletteVariantPaints {
    return TERMINAL_PALETTE_PAINTS[terminal.paint.preset][terminal.variant];
}

function rgba(rgbChannels: string, opacity: number): string {
    return `rgba(${rgbChannels},${opacity})`;
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
        case "pixel-window":
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

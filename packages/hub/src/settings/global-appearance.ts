import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import {
    formatHexColor,
    hslToRgb,
    parseHexColor,
    rgbToHsl,
    type RgbColor,
} from "../shared/color-utils";
import type { MetricVisualSettings } from "./visual-adapter";
import type { ResolvedGlobalAppearanceOverride, ResolvedGlobalSettings } from "./resolved-settings";

export interface TintChannelColors {
    primaryColor: string;
    secondaryColor: string;
}

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

export function applyGlobalAppearanceToVisualSettings(
    widgetSettings: MetricVisualSettings,
    globalSettings: ResolvedGlobalSettings,
): MetricVisualSettings {
    if (!globalSettings.appearanceOverride) {
        return widgetSettings;
    }

    const appearanceOverride = globalSettings.appearanceOverride;
    const channelColors = deriveTintChannelColors(appearanceOverride.tintColor);
    const thresholdColors = buildTintThresholdColors(channelColors.primaryColor);

    return {
        ...widgetSettings,
        viewLayout: appearanceOverride.viewLayout,
        circleStyle: appearanceOverride.circleStyle,
        theme: appearanceOverride.theme,
        colorMode: appearanceOverride.colorMode,
        usageColors: {
            solidColor: channelColors.primaryColor,
            lowColor: thresholdColors.lowColor,
            mediumColor: thresholdColors.mediumColor,
            highColor: thresholdColors.highColor,
        },
        lowColorThresholdPercent: appearanceOverride.lowColorThresholdPercent,
        highColorThresholdPercent: appearanceOverride.highColorThresholdPercent,
    };
}

export function buildGlobalChannelColorConfig(
    channel: "primary" | "secondary",
    globalSettings: ResolvedGlobalSettings,
): ColorConfig {
    const appearanceOverride = readAppearanceOverride(globalSettings);
    const channelColors = deriveTintChannelColors(appearanceOverride.tintColor);
    const channelColor = channel === "primary" ? channelColors.primaryColor : channelColors.secondaryColor;
    const thresholdColors = buildTintThresholdColors(channelColor);

    return {
        mode: appearanceOverride.colorMode,
        solidColor: channelColor,
        thresholds: buildThresholds({
            lowThreshold: appearanceOverride.lowColorThresholdPercent,
            highThreshold: appearanceOverride.highColorThresholdPercent,
            lowColor: thresholdColors.lowColor,
            mediumColor: thresholdColors.mediumColor,
            highColor: thresholdColors.highColor,
        }),
    };
}

export function deriveTintChannelColors(tintColor: string): TintChannelColors {
    const primaryColor = formatHexColor(readValidHexColor(tintColor));
    const primaryHslColor = rgbToHsl(readValidHexColor(primaryColor));
    const isPrimaryLight = primaryHslColor.lightness >= 0.55;
    const secondaryLightness = isPrimaryLight
        ? Math.max(0.22, primaryHslColor.lightness - 0.42)
        : Math.min(0.82, primaryHslColor.lightness + 0.42);
    const secondarySaturation = primaryHslColor.saturation < 0.12
        ? 0.18
        : Math.min(1, Math.max(0.42, primaryHslColor.saturation + (isPrimaryLight ? 0.08 : -0.04)));

    return {
        primaryColor,
        secondaryColor: formatHexColor(hslToRgb({
            hue: primaryHslColor.hue,
            saturation: secondarySaturation,
            lightness: secondaryLightness,
        })),
    };
}

export function buildTintThresholdColors(baseColor: string): {
    lowColor: string;
    mediumColor: string;
    highColor: string;
} {
    const baseHslColor = rgbToHsl(readValidHexColor(baseColor));
    const isBaseLight = baseHslColor.lightness >= 0.55;

    return {
        lowColor: formatHexColor(hslToRgb({
            hue: baseHslColor.hue,
            saturation: Math.max(0.25, baseHslColor.saturation * 0.72),
            lightness: isBaseLight ? Math.min(0.9, baseHslColor.lightness + 0.12) : Math.min(0.78, baseHslColor.lightness + 0.28),
        })),
        mediumColor: formatHexColor(readValidHexColor(baseColor)),
        highColor: formatHexColor(hslToRgb({
            hue: baseHslColor.hue,
            saturation: Math.min(1, Math.max(0.5, baseHslColor.saturation + 0.16)),
            lightness: isBaseLight ? Math.max(0.36, baseHslColor.lightness - 0.24) : Math.max(0.24, baseHslColor.lightness - 0.12),
        })),
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

function readAppearanceOverride(globalSettings: ResolvedGlobalSettings): ResolvedGlobalAppearanceOverride {
    if (!globalSettings.appearanceOverride) {
        throw new Error("Expected global appearance override.");
    }

    return globalSettings.appearanceOverride;
}

function readValidHexColor(hexColor: string): RgbColor {
    const color = parseHexColor(hexColor);

    if (color) {
        return color;
    }

    throw new Error(`Expected a valid hex color, got ${hexColor}.`);
}

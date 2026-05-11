import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import {
    formatHexColor,
    hslToRgb,
    parseHexColor,
    rgbToHsl,
    type RgbColor,
} from "../shared/color-utils";
import type { MetricVisualSettings } from "./visual-adapter";
import type { ResolvedGlobalSettings } from "./widget-settings";
export { defaultResolvedGlobalSettings } from "./widget-settings";

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
    if (!globalSettings.overrideWidgetAppearance) {
        return widgetSettings;
    }

    const appearanceDefaults = globalSettings.appearanceDefaults;
    const channelColors = deriveTintChannelColors(appearanceDefaults.usageColors.solidColor);
    const thresholdColors = buildTintThresholdColors(channelColors.primaryColor);

    return {
        ...widgetSettings,
        graphicType: appearanceDefaults.graphicType,
        circleStyle: appearanceDefaults.circleStyle,
        graphicStyle: appearanceDefaults.graphicStyle,
        colorMode: appearanceDefaults.colorMode,
        usageColors: {
            solidColor: channelColors.primaryColor,
            lowColor: thresholdColors.lowColor,
            mediumColor: thresholdColors.mediumColor,
            highColor: thresholdColors.highColor,
        },
        lowThreshold: appearanceDefaults.lowThreshold,
        highThreshold: appearanceDefaults.highThreshold,
    };
}

export function buildGlobalChannelColorConfig(
    channel: "primary" | "secondary",
    globalSettings: ResolvedGlobalSettings,
): ColorConfig {
    const appearanceDefaults = globalSettings.appearanceDefaults;
    const channelColors = deriveTintChannelColors(appearanceDefaults.usageColors.solidColor);
    const channelColor = channel === "primary" ? channelColors.primaryColor : channelColors.secondaryColor;
    const thresholdColors = buildTintThresholdColors(channelColor);

    return {
        mode: appearanceDefaults.colorMode,
        solidColor: channelColor,
        thresholds: buildThresholds({
            lowThreshold: appearanceDefaults.lowThreshold,
            highThreshold: appearanceDefaults.highThreshold,
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

function readValidHexColor(hexColor: string): RgbColor {
    const color = parseHexColor(hexColor);

    if (color) {
        return color;
    }

    throw new Error(`Expected a valid hex color, got ${hexColor}.`);
}

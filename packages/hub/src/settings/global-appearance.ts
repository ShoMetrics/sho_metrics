import type { ColorConfig, ColorThreshold } from "../rendering/color-resolver";
import type { MetricVisualSettings } from "../actions/metric-visual-settings";
import {
    defaultPluginGlobalSettings,
    type PluginGlobalSettings,
} from "./widget-settings";
export { defaultPluginGlobalSettings, normalizePluginGlobalSettings } from "./widget-settings";

export type GlobalAppearanceColorMode = "solid" | "threshold";

export interface TintChannelColors {
    primaryColor: string;
    secondaryColor: string;
}

const MINIMUM_THRESHOLD = 0;
const MAXIMUM_THRESHOLD = 100;

export function applyGlobalAppearanceToVisualSettings(
    widgetSettings: MetricVisualSettings,
    globalSettings: PluginGlobalSettings,
): MetricVisualSettings {
    if (!globalSettings.overrideWidgetAppearance) {
        return widgetSettings;
    }

    const appearanceDefaults = globalSettings.appearanceDefaults;
    const channelColors = deriveTintChannelColors(appearanceDefaults.solidColor);
    const thresholdColors = buildTintThresholdColors(channelColors.primaryColor);

    return {
        ...widgetSettings,
        graphicType: appearanceDefaults.graphicType,
        circleStyle: appearanceDefaults.circleStyle,
        graphicStyle: appearanceDefaults.graphicStyle,
        colorMode: appearanceDefaults.colorMode,
        solidColor: channelColors.primaryColor,
        lowThreshold: appearanceDefaults.lowThreshold,
        highThreshold: appearanceDefaults.highThreshold,
        colorLow: thresholdColors.lowColor,
        colorMedium: thresholdColors.mediumColor,
        colorHigh: thresholdColors.highColor,
    };
}

export function buildGlobalChannelColorConfig(
    channel: "primary" | "secondary",
    globalSettings: PluginGlobalSettings,
): ColorConfig {
    const appearanceDefaults = globalSettings.appearanceDefaults;
    const channelColors = deriveTintChannelColors(appearanceDefaults.solidColor);
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
    const primaryColor = normalizeHexColor(tintColor, defaultPluginGlobalSettings.appearanceDefaults.solidColor);
    const primaryHslColor = rgbToHsl(hexToRgb(primaryColor));
    const isPrimaryLight = primaryHslColor.lightness >= 0.55;
    const secondaryLightness = isPrimaryLight
        ? Math.max(0.22, primaryHslColor.lightness - 0.42)
        : Math.min(0.82, primaryHslColor.lightness + 0.42);
    const secondarySaturation = primaryHslColor.saturation < 0.12
        ? 0.18
        : Math.min(1, Math.max(0.42, primaryHslColor.saturation + (isPrimaryLight ? 0.08 : -0.04)));

    return {
        primaryColor,
        secondaryColor: rgbToHex(hslToRgb({
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
    const baseHslColor = rgbToHsl(hexToRgb(normalizeHexColor(baseColor, defaultPluginGlobalSettings.appearanceDefaults.solidColor)));
    const isBaseLight = baseHslColor.lightness >= 0.55;

    return {
        lowColor: rgbToHex(hslToRgb({
            hue: baseHslColor.hue,
            saturation: Math.max(0.25, baseHslColor.saturation * 0.72),
            lightness: isBaseLight ? Math.min(0.9, baseHslColor.lightness + 0.12) : Math.min(0.78, baseHslColor.lightness + 0.28),
        })),
        mediumColor: normalizeHexColor(baseColor, defaultPluginGlobalSettings.appearanceDefaults.solidColor),
        highColor: rgbToHex(hslToRgb({
            hue: baseHslColor.hue,
            saturation: Math.min(1, Math.max(0.5, baseHslColor.saturation + 0.16)),
            lightness: isBaseLight ? Math.max(0.36, baseHslColor.lightness - 0.24) : Math.max(0.24, baseHslColor.lightness - 0.12),
        })),
    };
}

function normalizeHexColor(value: string, fallbackColor: string): string {
    const normalizedColor = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor.toLowerCase() : fallbackColor;
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

interface RgbColor {
    red: number;
    green: number;
    blue: number;
}

interface HslColor {
    hue: number;
    saturation: number;
    lightness: number;
}

function hexToRgb(hexColor: string): RgbColor {
    return {
        red: Number.parseInt(hexColor.slice(1, 3), 16),
        green: Number.parseInt(hexColor.slice(3, 5), 16),
        blue: Number.parseInt(hexColor.slice(5, 7), 16),
    };
}

function rgbToHex(color: RgbColor): string {
    return `#${toHexByte(color.red)}${toHexByte(color.green)}${toHexByte(color.blue)}`;
}

function toHexByte(value: number): string {
    return Math.round(Math.min(Math.max(value, 0), 255)).toString(16).padStart(2, "0");
}

function rgbToHsl(color: RgbColor): HslColor {
    const red = color.red / 255;
    const green = color.green / 255;
    const blue = color.blue / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    let hue = 0;

    if (delta !== 0) {
        if (maximum === red) {
            hue = 60 * (((green - blue) / delta) % 6);
        } else if (maximum === green) {
            hue = 60 * ((blue - red) / delta + 2);
        } else {
            hue = 60 * ((red - green) / delta + 4);
        }
    }

    return {
        hue: hue < 0 ? hue + 360 : hue,
        saturation,
        lightness,
    };
}

function hslToRgb(color: HslColor): RgbColor {
    const chroma = (1 - Math.abs(2 * color.lightness - 1)) * color.saturation;
    const huePrime = color.hue / 60;
    const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
    const match = color.lightness - chroma / 2;
    const [redPrime, greenPrime, bluePrime] = resolveRgbPrime(huePrime, chroma, secondary);

    return {
        red: (redPrime + match) * 255,
        green: (greenPrime + match) * 255,
        blue: (bluePrime + match) * 255,
    };
}

function resolveRgbPrime(huePrime: number, chroma: number, secondary: number): readonly [number, number, number] {
    if (huePrime < 1) {
        return [chroma, secondary, 0];
    }

    if (huePrime < 2) {
        return [secondary, chroma, 0];
    }

    if (huePrime < 3) {
        return [0, chroma, secondary];
    }

    if (huePrime < 4) {
        return [0, secondary, chroma];
    }

    if (huePrime < 5) {
        return [secondary, 0, chroma];
    }

    return [chroma, 0, secondary];
}

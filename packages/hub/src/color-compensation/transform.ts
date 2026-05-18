import type { RgbColor } from "../shared/color-utils";
import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
} from "./types";

interface LinearRgbColor {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
}

export interface ColorCompensationFilterValues {
    readonly brightnessAmplitude: number;
    readonly shadowOffset: number;
    readonly gammaExponent: number;
    readonly saturationMultiplier: number;
}

const MINIMUM_LINEAR_CHANNEL = 0;
const MAXIMUM_LINEAR_CHANNEL = 1;
const MAXIMUM_SRGB_CHANNEL = 255;

export function resolveColorCompensationFilterValues(
    profile: ColorCompensationProfile,
): ColorCompensationFilterValues {
    const normalizedProfile = normalizeColorCompensationProfile(profile);

    return {
        brightnessAmplitude: 1 + normalizedProfile.brightnessAdjustment * 0.035,
        shadowOffset: normalizedProfile.shadowAdjustment * 0.012,
        gammaExponent: 1 - normalizedProfile.gammaAdjustment * 0.035,
        saturationMultiplier: 1 + normalizedProfile.saturationAdjustment * 0.055,
    };
}

export function applyColorCompensationToRgb(
    color: RgbColor,
    profile: ColorCompensationProfile = DEFAULT_COLOR_COMPENSATION_PROFILE,
): RgbColor {
    const filterValues = resolveColorCompensationFilterValues(profile);
    const linearColor = {
        red: color.red / MAXIMUM_SRGB_CHANNEL,
        green: color.green / MAXIMUM_SRGB_CHANNEL,
        blue: color.blue / MAXIMUM_SRGB_CHANNEL,
    };
    const adjustedColor = applySaturation(
        applyToneTransfer(linearColor, filterValues),
        filterValues.saturationMultiplier,
    );

    return {
        red: Math.round(clamp(adjustedColor.red, MINIMUM_LINEAR_CHANNEL, MAXIMUM_LINEAR_CHANNEL) * MAXIMUM_SRGB_CHANNEL),
        green: Math.round(clamp(adjustedColor.green, MINIMUM_LINEAR_CHANNEL, MAXIMUM_LINEAR_CHANNEL) * MAXIMUM_SRGB_CHANNEL),
        blue: Math.round(clamp(adjustedColor.blue, MINIMUM_LINEAR_CHANNEL, MAXIMUM_LINEAR_CHANNEL) * MAXIMUM_SRGB_CHANNEL),
    };
}

function applyToneTransfer(
    color: LinearRgbColor,
    filterValues: ColorCompensationFilterValues,
): LinearRgbColor {
    return {
        red: applyToneChannel(color.red, filterValues),
        green: applyToneChannel(color.green, filterValues),
        blue: applyToneChannel(color.blue, filterValues),
    };
}

function applyToneChannel(channelValue: number, filterValues: ColorCompensationFilterValues): number {
    const adjustedValue = filterValues.brightnessAmplitude * (channelValue ** filterValues.gammaExponent)
        + filterValues.shadowOffset;

    return clamp(adjustedValue, MINIMUM_LINEAR_CHANNEL, MAXIMUM_LINEAR_CHANNEL);
}

function applySaturation(color: LinearRgbColor, saturationMultiplier: number): LinearRgbColor {
    const luminance = 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;

    return {
        red: luminance + (color.red - luminance) * saturationMultiplier,
        green: luminance + (color.green - luminance) * saturationMultiplier,
        blue: luminance + (color.blue - luminance) * saturationMultiplier,
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

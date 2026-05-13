/**
 * RGB color channels in the browser/SVG 0-255 channel range.
 */
export interface RgbColor {
    red: number;
    green: number;
    blue: number;
}

const MINIMUM_COLOR_CHANNEL = 0;
const MAXIMUM_COLOR_CHANNEL = 255;

/**
 * Parses a 6-digit hex color into RGB channels.
 *
 * Accepts both "#RRGGBB" and "RRGGBB". Returns `undefined` instead of throwing
 * so callers can decide whether to preserve the original string or use a fallback.
 */
export function parseHexColor(hexColor: string): RgbColor | undefined {
    const colorMatch = /^#?([0-9a-f]{6})$/i.exec(hexColor.trim());

    if (!colorMatch) {
        return undefined;
    }

    const colorValue = colorMatch[1];

    return {
        red: Number.parseInt(colorValue.slice(0, 2), 16),
        green: Number.parseInt(colorValue.slice(2, 4), 16),
        blue: Number.parseInt(colorValue.slice(4, 6), 16),
    };
}

/**
 * Returns a canonical lowercase "#rrggbb" color or the provided fallback.
 *
 * Use this at settings/UI boundaries where invalid user or SDK data should not
 * flow further into rendering code.
 */
export function normalizeHexColor(value: string, fallbackColor: string): string {
    const normalizedColor = value.trim();
    return parseHexColor(normalizedColor) ? `#${normalizedColor.replace(/^#/, "").toLowerCase()}` : fallbackColor;
}

/**
 * Formats RGB channels as lowercase "#rrggbb".
 *
 * Channel values are rounded and clamped to the browser/SVG 0-255 range.
 */
export function formatHexColor(color: RgbColor): string {
    return `#${formatHexChannel(color.red)}${formatHexChannel(color.green)}${formatHexChannel(color.blue)}`;
}

/**
 * Lightens or darkens a hex color by a percentage.
 *
 * Positive percentages move each channel toward white; negative percentages
 * move each channel toward black. Invalid colors are returned trimmed and
 * unchanged to preserve existing renderer fallback behavior.
 */
export function adjustHexColorBrightness(hexColor: string, adjustmentPercent: number): string {
    const normalizedColor = hexColor.trim();
    const color = parseHexColor(normalizedColor);

    if (!color) {
        return normalizedColor;
    }

    const adjustmentRatio = clamp(adjustmentPercent, -100, 100) / 100;

    return formatHexColor({
        red: adjustColorChannel(color.red, adjustmentRatio),
        green: adjustColorChannel(color.green, adjustmentRatio),
        blue: adjustColorChannel(color.blue, adjustmentRatio),
    });
}

/**
 * Blends two hex colors using a 0-1 ratio.
 *
 * Ratio values are clamped. If either color is invalid, the function returns
 * the nearer original endpoint instead of inventing a replacement color.
 */
export function interpolateHexColor(fromColor: string, toColor: string, ratio: number): string {
    const fromColorChannels = parseHexColor(fromColor);
    const toColorChannels = parseHexColor(toColor);

    if (!fromColorChannels || !toColorChannels) {
        return ratio < 0.5 ? fromColor : toColor;
    }

    const clampedRatio = clamp(ratio, 0, 1);

    return formatHexColor({
        red: interpolateColorChannel(fromColorChannels.red, toColorChannels.red, clampedRatio),
        green: interpolateColorChannel(fromColorChannels.green, toColorChannels.green, clampedRatio),
        blue: interpolateColorChannel(fromColorChannels.blue, toColorChannels.blue, clampedRatio),
    });
}

/**
 * Picks black or white text for readable text over a solid background color.
 *
 * Uses WCAG relative luminance contrast math. The dark option is the project's
 * near-black UI text color rather than pure black.
 */
export function resolveReadableTextColor(backgroundColor: string): "#111827" | "#ffffff" {
    const color = parseHexColor(backgroundColor);

    if (!color) {
        return "#111827";
    }

    const luminance = resolveRelativeLuminance(color);
    const blackContrastRatio = (luminance + 0.05) / 0.05;
    const whiteContrastRatio = 1.05 / (luminance + 0.05);
    return whiteContrastRatio > blackContrastRatio ? "#ffffff" : "#111827";
}

/**
 * Computes WCAG relative luminance for RGB channels.
 *
 * The return value is in the 0-1 range, where 0 is black and 1 is white.
 */
export function resolveRelativeLuminance(color: RgbColor): number {
    return 0.2126 * resolveLinearColorChannel(color.red)
        + 0.7152 * resolveLinearColorChannel(color.green)
        + 0.0722 * resolveLinearColorChannel(color.blue);
}

function adjustColorChannel(channelValue: number, adjustmentRatio: number): number {
    if (adjustmentRatio >= 0) {
        return Math.round(channelValue + (MAXIMUM_COLOR_CHANNEL - channelValue) * adjustmentRatio);
    }

    return Math.round(channelValue * (1 + adjustmentRatio));
}

function interpolateColorChannel(fromChannel: number, toChannel: number, ratio: number): number {
    return Math.round(fromChannel + (toChannel - fromChannel) * ratio);
}

function formatHexChannel(channelValue: number): string {
    return Math.round(clamp(channelValue, MINIMUM_COLOR_CHANNEL, MAXIMUM_COLOR_CHANNEL))
        .toString(16)
        .padStart(2, "0");
}

function resolveLinearColorChannel(channelValue: number): number {
    const normalizedValue = channelValue / MAXIMUM_COLOR_CHANNEL;
    return normalizedValue <= 0.03928
        ? normalizedValue / 12.92
        : ((normalizedValue + 0.055) / 1.055) ** 2.4;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

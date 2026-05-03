export function escapeSvgText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

export type SvgTextAnchor = "start" | "middle" | "end";

export interface ConstrainedSvgTextOptions {
    id: string;
    text: string;
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    fontSize: number;
    fill: string;
    fontFamily: string;
    fontWeight: number | string;
    textAnchor?: SvgTextAnchor;
    dominantBaseline?: "middle" | "auto";
    clipHeight?: number;
    extraAttributes?: readonly string[];
}

const MINIMUM_TEXT_WIDTH = 1;

/**
 * Renders text inside an explicit SVG box. This helper intentionally does not
 * measure text or set textLength; the caller owns layout, and the clip path is
 * the hard safety boundary for dynamic telemetry or user-controlled strings.
 */
export function renderConstrainedSvgText(options: ConstrainedSvgTextOptions): string {
    const maxWidth = Math.max(MINIMUM_TEXT_WIDTH, options.maxWidth);
    const textAnchor = options.textAnchor ?? "start";
    const dominantBaseline = options.dominantBaseline ?? "middle";
    const fontSize = options.fontSize;
    const clipHeight = options.clipHeight ?? fontSize * 1.45;
    const clipXCoordinate = resolveTextClipXCoordinate(options.xCoordinate, maxWidth, textAnchor);
    const clipYCoordinate = dominantBaseline === "middle"
        ? options.yCoordinate - clipHeight / 2
        : options.yCoordinate - fontSize;
    const clipPathId = sanitizeSvgId(options.id);
    const extraAttributes = options.extraAttributes?.length
        ? ` ${options.extraAttributes.join(" ")}`
        : "";

    return `
        <defs>
            <clipPath id="${clipPathId}">
                <rect x="${formatSvgNumber(clipXCoordinate)}" y="${formatSvgNumber(clipYCoordinate)}"
                    width="${formatSvgNumber(maxWidth)}" height="${formatSvgNumber(clipHeight)}" />
            </clipPath>
        </defs>
        <g clip-path="url(#${clipPathId})">
            <text x="${formatSvgNumber(options.xCoordinate)}" y="${formatSvgNumber(options.yCoordinate)}"
                text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}"
                font-family="${escapeSvgText(options.fontFamily)}"
                font-size="${formatSvgNumber(fontSize)}" font-weight="${escapeSvgText(String(options.fontWeight))}"
                fill="${escapeSvgText(options.fill)}"${extraAttributes}>${escapeSvgText(options.text)}</text>
        </g>
    `;
}

export function adjustHexColorBrightness(hexColor: string, adjustmentPercent: number): string {
    const normalizedColor = hexColor.trim();
    const colorMatch = /^#?([0-9a-f]{6})$/i.exec(normalizedColor);

    if (!colorMatch) {
        return normalizedColor;
    }

    const colorValue = colorMatch[1];
    const adjustmentRatio = clamp(adjustmentPercent, -100, 100) / 100;

    const redChannel = adjustColorChannel(parseInt(colorValue.slice(0, 2), 16), adjustmentRatio);
    const greenChannel = adjustColorChannel(parseInt(colorValue.slice(2, 4), 16), adjustmentRatio);
    const blueChannel = adjustColorChannel(parseInt(colorValue.slice(4, 6), 16), adjustmentRatio);

    return `#${toHexChannel(redChannel)}${toHexChannel(greenChannel)}${toHexChannel(blueChannel)}`;
}

function adjustColorChannel(channelValue: number, adjustmentRatio: number): number {
    if (adjustmentRatio >= 0) {
        return Math.round(channelValue + (255 - channelValue) * adjustmentRatio);
    }

    return Math.round(channelValue * (1 + adjustmentRatio));
}

function toHexChannel(channelValue: number): string {
    return clamp(channelValue, 0, 255).toString(16).padStart(2, "0");
}

function resolveTextClipXCoordinate(xCoordinate: number, maxWidth: number, textAnchor: SvgTextAnchor): number {
    if (textAnchor === "middle") {
        return xCoordinate - maxWidth / 2;
    }

    if (textAnchor === "end") {
        return xCoordinate - maxWidth;
    }

    return xCoordinate;
}

function sanitizeSvgId(id: string): string {
    const sanitizedId = id.replace(/[^A-Za-z0-9_-]/g, "-");

    return sanitizedId.length > 0 ? sanitizedId : "constrained-svg-text";
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

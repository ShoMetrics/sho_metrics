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

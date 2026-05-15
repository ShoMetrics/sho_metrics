export interface SvgPaintScanFinding {
    readonly paintName: string;
    readonly value: string;
}

const NEUTRAL_PAINT_KEYWORDS = new Set([
    "none",
    "transparent",
    "white",
    "black",
    "currentcolor",
    "inherit",
    "unset",
    "initial",
]);
const RGB_CHANNEL_EPSILON = 0.0001;

export function scanChromaticSvgPaintValues(svg: string): readonly SvgPaintScanFinding[] {
    const findings: SvgPaintScanFinding[] = [];

    for (const match of svg.matchAll(createPaintAttributePattern())) {
        addFindingIfChromatic(
            findings,
            match.groups?.paintName,
            match.groups?.doubleQuotedPaint ?? match.groups?.singleQuotedPaint,
        );
    }

    for (const styleMatch of svg.matchAll(createStyleAttributePattern())) {
        const styleValue = styleMatch.groups?.doubleQuotedStyle ?? styleMatch.groups?.singleQuotedStyle;
        if (!styleValue) {
            continue;
        }

        for (const paintMatch of styleValue.matchAll(createStylePaintDeclarationPattern())) {
            addFindingIfChromatic(
                findings,
                paintMatch.groups?.paintName,
                paintMatch.groups?.paintValue,
            );
        }
    }

    return findings;
}

function addFindingIfChromatic(
    findings: SvgPaintScanFinding[],
    paintName: string | undefined,
    paintValue: string | undefined,
): void {
    if (!paintName || !paintValue || isNeutralSvgPaintValue(paintValue)) {
        return;
    }

    findings.push({
        paintName,
        value: paintValue.trim(),
    });
}

function createPaintAttributePattern(): RegExp {
    return /\s(?<paintName>fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(?:"(?<doubleQuotedPaint>[^"]*)"|'(?<singleQuotedPaint>[^']*)')/giu;
}

function createStyleAttributePattern(): RegExp {
    return /\sstyle\s*=\s*(?:"(?<doubleQuotedStyle>[^"]*)"|'(?<singleQuotedStyle>[^']*)')/giu;
}

function createStylePaintDeclarationPattern(): RegExp {
    return /(?:^|;)\s*(?<paintName>fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*(?<paintValue>[^;]+)/giu;
}

function isNeutralSvgPaintValue(value: string): boolean {
    const normalizedValue = value
        .trim()
        .replace(/\s*!important$/iu, "")
        .toLowerCase();

    if (NEUTRAL_PAINT_KEYWORDS.has(normalizedValue)) {
        return true;
    }

    if (/^url\(.+\)$/iu.test(normalizedValue)) {
        return true;
    }

    if (normalizedValue.startsWith("#")) {
        return isNeutralHexPaintValue(normalizedValue);
    }

    return isNeutralRgbPaintValue(normalizedValue);
}

function isNeutralHexPaintValue(value: string): boolean {
    const hexValue = value.slice(1);

    if (!/^[0-9a-f]+$/iu.test(hexValue)) {
        return false;
    }

    if (hexValue.length === 3 || hexValue.length === 4) {
        return hexValue[0] === hexValue[1] && hexValue[1] === hexValue[2];
    }

    if (hexValue.length === 6 || hexValue.length === 8) {
        const red = hexValue.slice(0, 2);
        const green = hexValue.slice(2, 4);
        const blue = hexValue.slice(4, 6);

        return red === green && green === blue;
    }

    return false;
}

function isNeutralRgbPaintValue(value: string): boolean {
    const match = /^rgba?\(\s*(?<rgbBody>[^)]*)\s*\)$/iu.exec(value);
    const rgbBody = match?.groups?.rgbBody;

    if (!rgbBody) {
        return false;
    }

    const channels = parseRgbChannelValues(rgbBody);

    if (!channels) {
        return false;
    }

    return Math.abs(channels[0] - channels[1]) < RGB_CHANNEL_EPSILON
        && Math.abs(channels[1] - channels[2]) < RGB_CHANNEL_EPSILON;
}

function parseRgbChannelValues(rgbBody: string): readonly [number, number, number] | null {
    const channelText = rgbBody.split("/")[0].trim();
    const channelValues = channelText.includes(",")
        ? channelText.split(",").slice(0, 3)
        : channelText.split(/\s+/u).slice(0, 3);

    if (channelValues.length !== 3) {
        return null;
    }

    const red = parseRgbChannelValue(channelValues[0]);
    const green = parseRgbChannelValue(channelValues[1]);
    const blue = parseRgbChannelValue(channelValues[2]);

    if (red == null || green == null || blue == null) {
        return null;
    }

    return [red, green, blue];
}

function parseRgbChannelValue(value: string): number | null {
    const match = /^(?<channelValue>(?:\d+\.?\d*|\.\d+))(?<percent>%)?$/u.exec(value.trim());
    const channelValue = match?.groups?.channelValue;

    if (!channelValue) {
        return null;
    }

    const numericValue = Number(channelValue);

    if (!Number.isFinite(numericValue)) {
        return null;
    }

    return match.groups?.percent ? numericValue * 255 / 100 : numericValue;
}

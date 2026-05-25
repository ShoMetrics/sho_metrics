import { adjustHexColorBrightness } from "../shared/color-utils";
import {
    DEFAULT_RENDER_TEXT_CLIP_HEIGHT_EM,
    DEFAULT_RENDER_TEXT_MINIMUM_FONT_SCALE,
    DEFAULT_RENDER_TEXT_WIDTH_SCALE,
    resolveRenderTextStyleFontSize,
    type RenderTextStyle,
} from "./render-text-style";

export { adjustHexColorBrightness };

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
    /** Legacy title-card escape hatch. New callers should prefer clipHeightEm. */
    clipHeight?: number;
    clipHeightEm?: number;
    extraAttributes?: readonly string[];
    fitOptions?: SvgTextFitOptions;
}

export interface StyledSvgTextOptions {
    id: string;
    text: string;
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    baseFontSize: number;
    fill: string;
    textStyle: RenderTextStyle;
    textAnchor?: SvgTextAnchor;
    dominantBaseline?: "middle" | "auto";
    extraAttributes?: readonly string[];
    fitOptions?: SvgTextFitOptions;
}

export interface SvgTextFitOptions {
    minimumFontScale?: number;
    widthGuardRatio?: number;
    widthScale?: number;
}

export interface SvgTextFitRun {
    text: string;
    fontSize: number;
    fontWeight?: number | string;
}

export interface SvgTextFitResult {
    fontScale: number;
    textLength: number | null;
}

const MINIMUM_TEXT_WIDTH = 1;
const DEFAULT_TEXT_WIDTH_GUARD_RATIO = 1.08;

export function renderStyledSvgText(options: StyledSvgTextOptions): string {
    const fontSize = resolveRenderTextStyleFontSize(options.baseFontSize, options.textStyle);
    const yCoordinate = options.yCoordinate + fontSize * options.textStyle.baselineShiftEm;

    return renderConstrainedSvgText({
        id: options.id,
        text: options.text,
        xCoordinate: options.xCoordinate,
        yCoordinate,
        maxWidth: options.maxWidth,
        fontSize,
        fill: options.fill,
        fontFamily: options.textStyle.fontFamily,
        fontWeight: options.textStyle.fontWeight,
        textAnchor: options.textAnchor,
        dominantBaseline: options.dominantBaseline,
        clipHeightEm: options.textStyle.clipHeightEm,
        extraAttributes: options.extraAttributes,
        fitOptions: {
            ...options.fitOptions,
            minimumFontScale: options.fitOptions?.minimumFontScale ?? options.textStyle.minimumFontScale,
            widthScale: options.textStyle.widthScale,
        },
    });
}

/**
 * Renders text inside an explicit SVG box. This helper intentionally does not
 * measure text or set textLength; the caller owns layout, and the clip path is
 * the hard safety boundary for dynamic telemetry or user-controlled strings.
 */
export function renderConstrainedSvgText(options: ConstrainedSvgTextOptions): string {
    const maxWidth = Math.max(MINIMUM_TEXT_WIDTH, options.maxWidth);
    const textAnchor = options.textAnchor ?? "start";
    const dominantBaseline = options.dominantBaseline ?? "middle";
    const textFit = resolveSvgTextFit({
        runs: [{
            text: options.text,
            fontSize: options.fontSize,
            fontWeight: options.fontWeight,
        }],
        maxWidth,
        fitOptions: options.fitOptions,
    });
    const fontSize = options.fontSize * textFit.fontScale;
    const clipHeight = options.clipHeight ?? fontSize * (options.clipHeightEm ?? DEFAULT_RENDER_TEXT_CLIP_HEIGHT_EM);
    const clipXCoordinate = resolveTextClipXCoordinate(options.xCoordinate, maxWidth, textAnchor);
    const clipYCoordinate = dominantBaseline === "middle"
        ? options.yCoordinate - clipHeight / 2
        : options.yCoordinate - fontSize;
    const clipPathId = sanitizeSvgId(options.id, "constrained-svg-text");
    const extraAttributes = options.extraAttributes?.length
        ? ` ${options.extraAttributes.join(" ")}`
        : "";
    const textFitAttributes = formatSvgTextFitAttributes(textFit);

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
                fill="${escapeSvgText(options.fill)}"${textFitAttributes}${extraAttributes}>${escapeSvgText(options.text)}</text>
        </g>
    `;
}

/**
 * Estimates whether text should shrink inside a fixed SVG box.
 *
 * resvg does not expose cheap pre-render text measurement from JavaScript, and
 * per-frame native measurement would hurt the hot render path. This estimator is
 * intentionally conservative: near-boundary text gets a small font reduction
 * plus SVG textLength as a hard final guard. Very long user text can still be
 * compressed, but it cannot spill outside the widget.
 *
 * `widthScale` adjusts the raw estimated width before `widthGuardRatio` is
 * applied. Final guarded width is
 * `rawEstimate * widthScale * widthGuardRatio`.
 */
export function resolveSvgTextFit(options: {
    runs: readonly SvgTextFitRun[];
    maxWidth: number;
    extraWidth?: number;
    fitOptions?: SvgTextFitOptions;
}): SvgTextFitResult {
    const maxWidth = Math.max(MINIMUM_TEXT_WIDTH, options.maxWidth);
    const minimumFontScale = clamp(
        options.fitOptions?.minimumFontScale ?? DEFAULT_RENDER_TEXT_MINIMUM_FONT_SCALE,
        0.35,
        1,
    );
    const widthGuardRatio = clamp(
        options.fitOptions?.widthGuardRatio ?? DEFAULT_TEXT_WIDTH_GUARD_RATIO,
        1,
        2,
    );
    const widthScale = clamp(
        options.fitOptions?.widthScale ?? DEFAULT_RENDER_TEXT_WIDTH_SCALE,
        0.5,
        2,
    );
    const estimatedWidth = options.runs.reduce(
        (widthTotal, textRun) => widthTotal + estimateSvgTextRunWidth(textRun),
        Math.max(0, options.extraWidth ?? 0),
    );
    const guardedWidth = estimatedWidth * widthScale * widthGuardRatio;

    if (guardedWidth <= maxWidth) {
        return {
            fontScale: 1,
            textLength: null,
        };
    }

    const idealFontScale = maxWidth / guardedWidth;
    const fontScale = clamp(idealFontScale, minimumFontScale, 1);

    return {
        fontScale,
        textLength: maxWidth,
    };
}

export function formatSvgTextFitAttributes(textFit: SvgTextFitResult): string {
    if (textFit.textLength == null) {
        return "";
    }

    return ` textLength="${formatSvgNumber(textFit.textLength)}" lengthAdjust="spacingAndGlyphs"`;
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

function estimateSvgTextRunWidth(textRun: SvgTextFitRun): number {
    const fontWeight = typeof textRun.fontWeight === "number" ? textRun.fontWeight : 400;
    const weightRatio = fontWeight >= 850 ? 1.03 : fontWeight >= 700 ? 1.015 : 1;

    return Array.from(textRun.text).reduce((widthTotal, character) => {
        return widthTotal + estimateSvgCharacterWidthRatio(character) * textRun.fontSize * weightRatio;
    }, 0);
}

function estimateSvgCharacterWidthRatio(character: string): number {
    if (character === "\t" || character === " ") {
        return 0.32;
    }

    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character)) {
        return 1;
    }

    if (/[ilI1|!.,:;]/u.test(character)) {
        return 0.28;
    }

    if (/[fjrt]/u.test(character)) {
        return 0.36;
    }

    if (/[mwMW@#%&]/u.test(character)) {
        return 0.86;
    }

    if (/[A-Z0-9]/u.test(character)) {
        return 0.62;
    }

    if (/[\u2190-\u21ff\u2200-\u22ff]/u.test(character)) {
        return 0.72;
    }

    if (/[\u00b0\u03bc\u03a9+\-=/*\\]/u.test(character)) {
        return 0.52;
    }

    return 0.52;
}

export function sanitizeSvgId(id: string, fallbackId: string): string {
    const sanitizedId = id.replace(/[^A-Za-z0-9_-]/g, "-");

    return sanitizedId.length > 0 ? sanitizedId : fallbackId;
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

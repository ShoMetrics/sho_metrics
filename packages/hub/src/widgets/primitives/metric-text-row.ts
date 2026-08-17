import {
    clamp,
    escapeSvgText,
    formatSvgTextOutlineAttributes,
    formatSvgTextFitAttributes,
    resolveSvgTextOutlineStrokeWidth,
    resolveSvgTextFit,
    sanitizeSvgId,
    type SvgTextAnchor,
    type SvgTextFitOptions,
} from "../../view-rendering/rasterize/svg-utils";
import {
    resolveRenderTextStyleFontSize,
    type RenderTextStyle,
} from "../../view-rendering/rasterize/render-text-style";
import type { RenderOutlineTokens } from "../../view-rendering/color/render-appearance";

interface MetricTextRowOptions {
    readonly id: string;
    readonly layout: MetricTextRowLayout;
    readonly value: MetricTextSegment;
    readonly unit: MetricTextUnitSegment;
    readonly outline?: RenderOutlineTokens;
    readonly fitOptions?: SvgTextFitOptions;
}

interface MetricTextRowLayout {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly textAnchor?: SvgTextAnchor;
    readonly clipHeight?: number;
}

interface MetricTextSegment {
    readonly text: string;
    readonly baseFontSize: number;
    readonly textStyle: RenderTextStyle;
    readonly fill: string;
    readonly extraAttributes?: readonly string[];
}

interface MetricTextUnitSegment extends MetricTextSegment {
    readonly baselineOffset?: number;
}

const MINIMUM_ROW_WIDTH = 1;

/**
 * Per-side room between the fit width and the clip box.
 *
 * SVG `textLength` constrains the advance width, not the ink. Glyphs with an
 * overhanging right edge, `%` most of all, paint past the advance once the row
 * is compressed, and a clip box sized exactly to the fit width shaves that
 * column off. Measured at 1 px of overhang for `100 %` in the full-ring centre
 * row at 144 logical, with the default preset; 2 leaves margin.
 *
 * How far ink runs past the advance depends on the font and the rasterizer, so
 * this is not a universal constant, only one wide enough for the bundled faces
 * at the sizes in use. It is applied to every row rather than per style because
 * the failure it prevents is not specific to one theme; the per-style bleed
 * added on top covers faces that need more. Widening the box does relax the
 * overflow guard by the same 2 px, which is the cost of not clipping ink.
 */
const ROW_INK_CLIP_HEADROOM_PIXELS = 2;

/**
 * Renders a metric value and unit as one SVG text row inside a fixed box.
 * The row relies on resvg's own text layout for glyph placement, then clips the
 * final result to the caller-provided box. No per-frame text measurement or
 * third-party font layout dependency is used.
 */
export function renderMetricTextRow(options: MetricTextRowOptions): string {
    const width = Math.max(MINIMUM_ROW_WIDTH, options.layout.width);
    const textAnchor = options.layout.textAnchor ?? "start";
    const unitTier = resolveUnitTier(options.unit.text);
    const rawValueFontSize = resolveRenderTextStyleFontSize(options.value.baseFontSize, options.value.textStyle);
    const rawUnitFontSize = resolveRenderTextStyleFontSize(options.unit.baseFontSize, options.unit.textStyle)
        * unitTier.fontScale;
    const textFit = resolveSvgTextFit({
        runs: [
            {
                text: options.value.text,
                fontSize: rawValueFontSize,
                fontWeight: options.value.textStyle.fontWeight,
                letterSpacing: rawValueFontSize * options.value.textStyle.letterSpacingEm,
            },
            {
                text: options.unit.text,
                fontSize: rawUnitFontSize,
                fontWeight: options.unit.textStyle.fontWeight,
                letterSpacing: rawUnitFontSize * options.unit.textStyle.letterSpacingEm,
            },
        ],
        maxWidth: width,
        extraWidth: options.unit.text.length > 0 ? unitTier.gap : 0,
        fitOptions: {
            ...options.fitOptions,
            minimumFontScale: options.fitOptions?.minimumFontScale ?? resolveRowMinimumFontScale(
                options.value.textStyle,
                options.unit.textStyle,
            ),
            widthScale: resolveRowWidthScale(options.value.textStyle, options.unit.textStyle),
        },
    });
    const valueFontSize = rawValueFontSize * textFit.fontScale;
    const unitFontSize = rawUnitFontSize * textFit.fontScale;
    const valueLetterSpacing = valueFontSize * options.value.textStyle.letterSpacingEm;
    const unitLetterSpacing = unitFontSize * options.unit.textStyle.letterSpacingEm;
    const unitGap = unitTier.gap * textFit.fontScale;
    const yCoordinate = options.layout.yCoordinate + valueFontSize * options.value.textStyle.baselineShiftEm;
    const unitBaselineShift = unitFontSize * options.unit.textStyle.baselineShiftEm
        - valueFontSize * options.value.textStyle.baselineShiftEm;
    const unitBaselineOffset = (options.unit.baselineOffset ?? 0) + unitBaselineShift;
    // The clip remains centered on the value run so existing row geometry stays stable.
    const clipHeight = options.layout.clipHeight
        ?? Math.max(
            valueFontSize * options.value.textStyle.clipHeightEm,
            unitFontSize * options.unit.textStyle.clipHeightEm,
        );
    const clipPathId = sanitizeSvgId(options.id, "metric-text-row");
    const clipHorizontalBleed = ROW_INK_CLIP_HEADROOM_PIXELS + Math.max(
        options.value.textStyle.clipHorizontalBleedPixels,
        options.unit.textStyle.clipHorizontalBleedPixels,
    );
    const clipWidth = width + clipHorizontalBleed * 2;
    const clipXCoordinate = resolveClipXCoordinate(options.layout.xCoordinate, width, textAnchor)
        - clipHorizontalBleed;
    const clipYCoordinate = yCoordinate - clipHeight / 2;
    const valueAttributes = options.value.extraAttributes?.length
        ? ` ${options.value.extraAttributes.join(" ")}`
        : "";
    const unitAttributes = options.unit.extraAttributes?.length
        ? ` ${options.unit.extraAttributes.join(" ")}`
        : "";
    const valueLetterSpacingAttribute = formatSvgLetterSpacingAttribute(valueLetterSpacing);
    const unitLetterSpacingAttribute = formatSvgLetterSpacingAttribute(unitLetterSpacing);
    const unitTspan = options.unit.text.length > 0
        ? `<tspan dx="${formatSvgNumber(unitGap)}" dy="${formatSvgNumber(unitBaselineOffset)}"
                font-family="${escapeSvgText(options.unit.textStyle.fontFamily)}" font-size="${formatSvgNumber(unitFontSize)}"
                font-weight="${options.unit.textStyle.fontWeight}"
                fill="${escapeSvgText(options.unit.fill)}"${unitLetterSpacingAttribute}${unitAttributes}>${escapeSvgText(options.unit.text)}</tspan>`
        : "";
    const textFitAttributes = formatSvgTextFitAttributes(textFit);
    const textOutlineStrokeWidth = options.outline === undefined
        ? 0
        : resolveSvgTextOutlineStrokeWidth(valueFontSize, options.outline);
    const outlineAttributes = formatSvgTextOutlineAttributes({
        outline: options.outline,
        strokeWidth: textOutlineStrokeWidth,
        lineJoin: "round",
    });
    // Keep outline inside the row clip; callers own extra edge room for enabled outlines.
    const textElement = `<text x="${formatSvgNumber(options.layout.xCoordinate)}" y="${formatSvgNumber(yCoordinate)}"
                text-anchor="${textAnchor}" dominant-baseline="middle"${textFitAttributes}${outlineAttributes}><tspan
                    font-family="${escapeSvgText(options.value.textStyle.fontFamily)}" font-size="${formatSvgNumber(valueFontSize)}"
                    font-weight="${options.value.textStyle.fontWeight}"
                    fill="${escapeSvgText(options.value.fill)}"${valueLetterSpacingAttribute}${valueAttributes}>${escapeSvgText(options.value.text)}</tspan>${unitTspan}</text>`;

    return `
        <defs>
            <clipPath id="${clipPathId}">
                <rect x="${formatSvgNumber(clipXCoordinate)}" y="${formatSvgNumber(clipYCoordinate)}"
                    width="${formatSvgNumber(clipWidth)}" height="${formatSvgNumber(clipHeight)}" />
            </clipPath>
        </defs>
        <g clip-path="url(#${clipPathId})">
            ${textElement}
        </g>
    `;
}

function resolveRowMinimumFontScale(valueTextStyle: RenderTextStyle, unitTextStyle: RenderTextStyle): number {
    // A shared row font scale must honor the stricter lower bound from either run.
    return Math.max(
        valueTextStyle.minimumFontScale,
        unitTextStyle.minimumFontScale,
    );
}

function resolveRowWidthScale(valueTextStyle: RenderTextStyle, unitTextStyle: RenderTextStyle): number {
    return Math.max(
        valueTextStyle.widthScale,
        unitTextStyle.widthScale,
    );
}

function resolveUnitTier(unitText: string): { gap: number; fontScale: number } {
    const unitLength = Array.from(unitText.trim()).length;

    if (unitLength === 0) {
        return { gap: 0, fontScale: 1 };
    }

    if (unitLength === 1) {
        return { gap: 4, fontScale: 1 };
    }

    if (unitLength === 2) {
        return { gap: 4, fontScale: 0.98 };
    }

    if (unitLength === 3) {
        return { gap: 3, fontScale: 0.94 };
    }

    return { gap: 3, fontScale: 0.88 };
}

function resolveClipXCoordinate(xCoordinate: number, width: number, textAnchor: SvgTextAnchor): number {
    if (textAnchor === "middle") {
        return xCoordinate - width / 2;
    }

    if (textAnchor === "end") {
        return xCoordinate - width;
    }

    return xCoordinate;
}

function formatSvgNumber(value: number): string {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const roundedValue = clamp(finiteValue, -10000, 10000);

    return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(2);
}

function formatSvgLetterSpacingAttribute(letterSpacing: number): string {
    if (letterSpacing === 0) {
        return "";
    }

    return ` letter-spacing="${formatSvgNumber(letterSpacing)}"`;
}

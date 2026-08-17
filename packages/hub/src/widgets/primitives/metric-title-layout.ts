import type { RenderOutlineTokens } from "../../view-rendering/color/render-appearance";
import {
    clamp,
    estimateSvgTextRunWidth,
    renderStyledSvgText,
    resolveSvgTextFit,
} from "../../view-rendering/rasterize/svg-utils";
import { buildSvgFilterAttributes } from "../../view-rendering/rasterize/render-svg-effects";
import {
    resolveRenderTextStyleFontSize,
    type RenderTextStyle,
} from "../../view-rendering/rasterize/render-text-style";

const QUALIFIER_TITLE_SKEW_DEGREES = -10;
/**
 * Clip headroom for the two title runs.
 *
 * Each run is positioned from its estimated advance, and renderStyledSvgText
 * derives its clip box from the same number, so a small underestimate chops the
 * last glyph (this clipped the "M" of "RAM" once weights started rendering).
 * The runs keep their estimated positions; only the clip gets slack.
 */
const QUALIFIER_TITLE_CLIP_HEADROOM_RATIO = 1.08;

export type SingleMetricLayoutMode = "wide" | "square";

interface SingleMetricTitleFontSizeRange {
    readonly heightRatio: number;
    readonly minimum: number;
    readonly maximum: number;
}

export interface SingleMetricTitleFontSizeConfig {
    readonly wide: SingleMetricTitleFontSizeRange;
    readonly square: SingleMetricTitleFontSizeRange;
}

/** Resolves responsive title sizing without coupling bar and sparkline typography. */
export function resolveSingleMetricTitleFontSize(
    layoutMode: SingleMetricLayoutMode,
    keyHeight: number,
    config: SingleMetricTitleFontSizeConfig,
): number {
    const range = config[layoutMode];

    return clamp(
        Math.round(keyHeight * range.heightRatio),
        range.minimum,
        range.maximum,
    );
}

/**
 * Synthesizes a restrained italic treatment around the text's own anchor.
 * resvg-js 2.6.2 does not synthesize an italic face from the bundled Inter faces.
 */
export function buildQualifierTextAttributes(
    xCoordinate: number,
    yCoordinate: number,
): readonly string[] {
    return [
        `transform="translate(${xCoordinate} ${yCoordinate}) ` +
        `skewX(${QUALIFIER_TITLE_SKEW_DEGREES}) translate(${-xCoordinate} ${-yCoordinate})"`,
    ];
}

interface QualifiedTitleOptions {
    readonly id: string;
    readonly labelText: string;
    readonly qualifierText: string;
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly maxWidth: number;
    readonly baseFontSize: number;
    readonly textStyle: RenderTextStyle;
    readonly fill: string;
    readonly outline?: RenderOutlineTokens;
}

/**
 * Centers a title while italicizing only its qualifier.
 * Both runs share one font scale so the qualifier never changes visual size.
 */
export function renderTitleWithQualifier(options: QualifiedTitleOptions): string {
    const resolvedFontSize = resolveRenderTextStyleFontSize(options.baseFontSize, options.textStyle);
    const letterSpacing = resolvedFontSize * options.textStyle.letterSpacingEm;
    const labelRun = {
        text: options.labelText,
        fontSize: resolvedFontSize,
        fontWeight: options.textStyle.fontWeight,
        letterSpacing,
    };
    const qualifierRun = {
        text: options.qualifierText,
        fontSize: resolvedFontSize,
        fontWeight: options.textStyle.fontWeight,
        letterSpacing,
    };
    const gapWidth = resolvedFontSize * 0.32;
    const textFit = resolveSvgTextFit({
        runs: [labelRun, qualifierRun],
        maxWidth: options.maxWidth,
        extraWidth: gapWidth,
        fitOptions: {
            minimumFontScale: options.textStyle.minimumFontScale,
            widthScale: options.textStyle.widthScale,
        },
    });
    const labelWidth = estimateSvgTextRunWidth(labelRun) * textFit.fontScale;
    const qualifierWidth = estimateSvgTextRunWidth(qualifierRun) * textFit.fontScale;
    const scaledGapWidth = gapWidth * textFit.fontScale;
    const combinedWidth = labelWidth + scaledGapWidth + qualifierWidth;
    const labelXCoordinate = options.xCoordinate - combinedWidth / 2;
    const qualifierXCoordinate = labelXCoordinate + labelWidth + scaledGapWidth;
    const scaledBaseFontSize = options.baseFontSize * textFit.fontScale;
    // Both runs already fit inside options.maxWidth, so the per-run fit only
    // needs to render at the resolved size without re-shrinking.
    const exactFitOptions = {
        minimumFontScale: 1,
        widthGuardRatio: 1,
        widthScale: 1,
    } as const;
    const filterAttributes = buildSvgFilterAttributes(options.textStyle.filter);

    return `
        ${renderStyledSvgText({
            id: `${options.id}-name`,
            text: options.labelText,
            xCoordinate: labelXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: labelWidth * QUALIFIER_TITLE_CLIP_HEADROOM_RATIO,
            baseFontSize: scaledBaseFontSize,
            textStyle: options.textStyle,
            fill: options.fill,
            outline: options.outline,
            extraAttributes: filterAttributes,
            fitOptions: exactFitOptions,
        })}
        ${renderStyledSvgText({
            id: `${options.id}-qualifier`,
            text: options.qualifierText,
            xCoordinate: qualifierXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: qualifierWidth * QUALIFIER_TITLE_CLIP_HEADROOM_RATIO,
            baseFontSize: scaledBaseFontSize,
            textStyle: options.textStyle,
            fill: options.fill,
            outline: options.outline,
            extraAttributes: [
                ...filterAttributes,
                ...buildQualifierTextAttributes(qualifierXCoordinate, options.yCoordinate),
            ],
            fitOptions: exactFitOptions,
        })}
    `;
}

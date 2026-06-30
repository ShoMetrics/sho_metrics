import type { DualChannelWidgetData, KeySize, WidgetData } from "../../view-rendering/widget-data";
import { resolveColorForThresholdValue } from "../../view-rendering/color/color-resolver";
import { buildSvgFilterAttributes } from "../../view-rendering/rasterize/render-svg-effects";
import type { RenderTextStyle } from "../../view-rendering/rasterize/render-text-style";
import { renderTitleCardDirectionIconFragment } from "../icons/title-card-icons";
import {
    escapeSvgText,
    isSvgOutlineEnabled,
    renderConstrainedSvgText,
    resolveSvgTextFit,
} from "../../view-rendering/rasterize/svg-utils";
import type { TextMetricConfig } from "./text-metric";

export interface TitleCardSingleMetricContent {
    readonly codeText: string;
    /** At most three display characters; used by the wide title-card code row. */
    readonly compactCodeText: string;
    /** Exactly three display characters; the title-card layout renders one caption row per character. */
    readonly threeCharacterCaptionText: string;
    readonly unitText: string;
}

export interface TitleCardDualMetricContent {
    readonly codeText: string;
    /** At most three display characters; used by the wide title-card code row. */
    readonly compactCodeText: string;
    /** Exactly three display characters; the title-card layout renders one caption row per character. */
    readonly threeCharacterCaptionText: string;
    readonly positiveLabelText: string;
    readonly positiveUnitText: string;
    readonly negativeLabelText: string;
    readonly negativeUnitText: string;
}

const TITLE_CARD_SQUARE_REFERENCE_SIZE = 144;

const TITLE_CARD_SQUARE_REFERENCE_LAYOUT = {
    codeX: 10,
    codeY: 22,
    codeWidth: 80,
    codeFontSize: 34,
    captionX: 10,
    captionWidth: 42,
    captionXScale: 0.56,
    captionYScale: 0.50,
    captionStrokeWidth: 0.75,
    captionRowYCoordinates: [61, 98, 134],
    captionFontSize: 58,
    valueX: 118,
    valueWidth: 78,
    valueFontSize: 62,
    valueBottomGuard: 3,
    unitX: 124,
    unitWidth: 16,
    unitFontSize: 17,
    compactValueX: 118,
    compactValueWidth: 78,
    compactValueFontSize: 46,
    compactUnitX: 124,
    compactUnitWidth: 16,
    compactUnitFontSize: 15,
    dualCodeX: 8,
    dualCodeY: 19,
    dualCodeWidth: 80,
    dualCodeFontSize: 31,
    dualChannelLabelX: 48,
    dualPositiveY: 99,
    dualNegativeY: 134,
    dualValueX: 118,
    dualValueWidth: 70,
    dualValueFontSize: 32,
    dualUnitX: 124,
    dualUnitWidth: 13,
    dualUnitFontSize: 12,
} as const;

const TITLE_CARD_WIDE_LAYOUT = {
    codeY: 13,
    codeXStart: 8,
    codeLetterGap: 16,
    codeFontSizes: [18, 18, 18],
    valueX: 139,
    valueY: 74,
    valueWidth: 104,
    valueFontSize: 66,
    unitX: 144,
    unitY: 85,
    unitWidth: 30,
    unitFontSize: 21,
    compactValueX: 139,
    compactValueY: 76,
    compactValueWidth: 104,
    compactValueFontSize: 44,
    compactUnitX: 144,
    compactUnitY: 84,
    compactUnitWidth: 30,
    compactUnitFontSize: 16,
} as const;

const TITLE_CARD_WIDE_CAPTION_COLUMN_LAYOUT = {
    xCoordinate: 8,
    maxWidth: 44,
    xScale: 0.58,
    yScale: 0.52,
    strokeWidth: 0.75,
    yCoordinates: [36, 62, 88],
    fontSize: 40,
} as const;

const TITLE_CARD_DUAL_WIDE_LAYOUT = {
    codeXStart: 8,
    codeY: 13,
    codeLetterGap: 16,
    codeFontSizes: [18, 18, 18],
    positiveY: 60,
    negativeY: 89,
    valueX: 139,
    valueWidth: 94,
    valueFontSize: 32,
    unitX: 144,
    unitWidth: 25,
    unitFontSize: 13,
    channelLabelX: 56,
} as const;

const TITLE_CARD_SINGLE_VALUE_TEXT_FIT_OPTIONS = { minimumFontScale: 1, widthGuardRatio: 1 } as const;
const TITLE_CARD_COMPACT_SINGLE_VALUE_TEXT_FIT_OPTIONS = { minimumFontScale: 0.55, widthGuardRatio: 1 } as const;
const TITLE_CARD_VALUE_TEXT_FIT_OPTIONS = { minimumFontScale: 0.44, widthGuardRatio: 1.08 } as const;
const TITLE_CARD_UNIT_TEXT_FIT_OPTIONS = { minimumFontScale: 0.55, widthGuardRatio: 1.16 } as const;
const TITLE_CARD_SINGLE_VALUE_BOTTOM_FONT_RATIO = 0.34;
const TITLE_CARD_SINGLE_UNIT_BOTTOM_FONT_RATIO = 0.95;
const TITLE_CARD_DUAL_UNIT_Y_OFFSET_RATIO = 0.15;

interface TitleCardCaptionColumnLayout {
    readonly xCoordinate: number;
    readonly maxWidth: number;
    readonly xScale: number;
    readonly yScale: number;
    readonly strokeWidth: number;
    readonly yCoordinates: readonly number[];
    readonly fontSize: number;
}

interface TitleCardSingleValueLayout {
    readonly valueXCoordinate: number;
    readonly valueYCoordinate: number;
    readonly valueWidth: number;
    readonly valueFontSize: number;
    readonly unitXCoordinate: number;
    readonly unitYCoordinate: number;
    readonly unitWidth: number;
    readonly unitFontSize: number;
}

interface TitleCardSquareSingleValueRowLayout {
    readonly valueXCoordinate: number;
    readonly valueWidth: number;
    readonly valueFontSize: number;
    readonly compactValueXCoordinate: number;
    readonly compactValueWidth: number;
    readonly compactValueFontSize: number;
    readonly unitXCoordinate: number;
    readonly unitWidth: number;
    readonly unitFontSize: number;
    readonly compactUnitXCoordinate: number;
    readonly compactUnitWidth: number;
    readonly compactUnitFontSize: number;
    readonly bottomYCoordinate: number;
    readonly bottomGuard: number;
}

interface TitleCardDualRowContent {
    readonly widgetData: WidgetData;
    readonly labelText: string;
    readonly unitText: string;
    readonly fill: string;
}

interface TitleCardDualRowLayout {
    readonly yCoordinate: number;
    readonly labelXCoordinate?: number | undefined;
    readonly valueXCoordinate: number;
    readonly valueWidth: number;
    readonly valueFontSize: number;
    readonly unitXCoordinate: number;
    readonly unitWidth: number;
    readonly unitFontSize: number;
    readonly unitTextAnchor?: "start" | "end" | undefined;
}

export function renderTitleCardTextMetric(
    data: WidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
    content: TitleCardSingleMetricContent,
    staticTextColor: string,
): string {
    if (isWideKeySize(keySize)) {
        return renderWideTitleCardTextMetric(data, config, content, staticTextColor);
    }

    return renderSquareTitleCardTextMetric(data, config, content, keySize, staticTextColor);
}

function renderSquareTitleCardTextMetric(
    data: WidgetData,
    config: TextMetricConfig,
    content: TitleCardSingleMetricContent,
    keySize: KeySize,
    staticTextColor: string,
): string {
    const valueText = data.displayValue ?? data.current.toFixed(0);
    const resolvedValueTextColor = resolveColorForThresholdValue(data.current, config.colorConfig);
    const layout = buildSquareTitleCardLayout(keySize);
    const singleValueLayout = resolveSquareTitleCardSingleValueLayout(
        valueText,
        layout.singleValueRows,
        config.textStyles.value,
    );

    return `
        ${renderConstrainedSvgText({
            id: "title-card-code",
            text: content.codeText,
            xCoordinate: layout.codeX,
            yCoordinate: layout.codeY,
            maxWidth: layout.codeWidth,
            fontSize: layout.codeFontSize * config.textStyles.title.fontSizeScale,
            fontFamily: config.textStyles.title.fontFamily,
            fontWeight: config.textStyles.title.fontWeight,
            fill: staticTextColor,
            textAnchor: "start",
            outline: config.textOutline,
            extraAttributes: [
                titleCardScaleTransformAttribute(
                    layout.codeX,
                    layout.codeY,
                    1,
                    0.84,
                ),
                ...buildTitleCardStrokeAttributes(staticTextColor, 0.35, config.textOutline),
                ...buildSvgFilterAttributes(config.textStyles.title.filter),
            ],
        })}
        ${renderTitleCardCaptionColumn({
            idPrefix: "title-card-caption",
            characters: titleCardCaptionCharacters(content.threeCharacterCaptionText),
            layout: layout.caption,
            fill: staticTextColor,
            textStyle: config.textStyles.title,
            outline: config.textOutline,
        })}
        ${renderConstrainedSvgText({
            id: "title-card-value",
            text: valueText,
            xCoordinate: singleValueLayout.valueXCoordinate,
            yCoordinate: singleValueLayout.valueYCoordinate,
            maxWidth: singleValueLayout.valueWidth,
            fontSize: singleValueLayout.valueFontSize * config.textStyles.value.fontSizeScale,
            fontFamily: config.textStyles.value.fontFamily,
            fontWeight: config.textStyles.value.fontWeight,
            fill: resolvedValueTextColor,
            textAnchor: "end",
            outline: config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildTitleCardStrokeAttributes(resolvedValueTextColor, 0.7, config.textOutline),
                ...buildSvgFilterAttributes(config.textStyles.value.filter),
            ],
            fitOptions: resolveTitleCardSingleValueTextFitOptions(valueText),
        })}
        ${renderTitleCardUnitText({
            id: "title-card-unit",
            unitText: content.unitText,
            xCoordinate: singleValueLayout.unitXCoordinate,
            yCoordinate: singleValueLayout.unitYCoordinate,
            maxWidth: singleValueLayout.unitWidth,
            fontSize: singleValueLayout.unitFontSize,
            fill: config.unitTextColor,
            textStyle: config.textStyles.unit,
            textAnchor: "start",
            outline: config.textOutline,
        })}
    `;
}

function renderWideTitleCardTextMetric(
    data: WidgetData,
    config: TextMetricConfig,
    content: TitleCardSingleMetricContent,
    staticTextColor: string,
): string {
    const valueText = data.displayValue ?? data.current.toFixed(0);
    const resolvedValueTextColor = resolveColorForThresholdValue(data.current, config.colorConfig);
    const singleValueLayout = resolveTitleCardSingleValueLayout(valueText, {
        valueXCoordinate: TITLE_CARD_WIDE_LAYOUT.valueX,
        valueYCoordinate: TITLE_CARD_WIDE_LAYOUT.valueY,
        valueWidth: TITLE_CARD_WIDE_LAYOUT.valueWidth,
        valueFontSize: TITLE_CARD_WIDE_LAYOUT.valueFontSize,
        unitXCoordinate: TITLE_CARD_WIDE_LAYOUT.unitX,
        unitYCoordinate: TITLE_CARD_WIDE_LAYOUT.unitY,
        unitWidth: TITLE_CARD_WIDE_LAYOUT.unitWidth,
        unitFontSize: TITLE_CARD_WIDE_LAYOUT.unitFontSize,
    }, {
        valueXCoordinate: TITLE_CARD_WIDE_LAYOUT.compactValueX,
        valueYCoordinate: TITLE_CARD_WIDE_LAYOUT.compactValueY,
        valueWidth: TITLE_CARD_WIDE_LAYOUT.compactValueWidth,
        valueFontSize: TITLE_CARD_WIDE_LAYOUT.compactValueFontSize,
        unitXCoordinate: TITLE_CARD_WIDE_LAYOUT.compactUnitX,
        unitYCoordinate: TITLE_CARD_WIDE_LAYOUT.compactUnitY,
        unitWidth: TITLE_CARD_WIDE_LAYOUT.compactUnitWidth,
        unitFontSize: TITLE_CARD_WIDE_LAYOUT.compactUnitFontSize,
    });

    return `
        ${renderTitleCardCaptionColumn({
            idPrefix: "title-card-caption",
            characters: titleCardCaptionCharacters(content.threeCharacterCaptionText),
            layout: TITLE_CARD_WIDE_CAPTION_COLUMN_LAYOUT,
            fill: staticTextColor,
            textStyle: config.textStyles.title,
            outline: config.textOutline,
        })}
        ${renderTitleCardCodeLetters({
            idPrefix: "title-card-code",
            codeText: content.compactCodeText,
            xStart: TITLE_CARD_WIDE_LAYOUT.codeXStart,
            yCoordinate: TITLE_CARD_WIDE_LAYOUT.codeY,
            letterGap: TITLE_CARD_WIDE_LAYOUT.codeLetterGap,
            fontSizes: TITLE_CARD_WIDE_LAYOUT.codeFontSizes,
            fill: staticTextColor,
            textStyle: config.textStyles.smallLabel,
            outline: config.textOutline,
        })}
        ${renderConstrainedSvgText({
            id: "title-card-value",
            text: valueText,
            xCoordinate: singleValueLayout.valueXCoordinate,
            yCoordinate: singleValueLayout.valueYCoordinate,
            maxWidth: singleValueLayout.valueWidth,
            fontSize: singleValueLayout.valueFontSize * config.textStyles.value.fontSizeScale,
            fontFamily: config.textStyles.value.fontFamily,
            fontWeight: config.textStyles.value.fontWeight,
            fill: resolvedValueTextColor,
            textAnchor: "end",
            outline: config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildTitleCardStrokeAttributes(resolvedValueTextColor, 0.7, config.textOutline),
                ...buildSvgFilterAttributes(config.textStyles.value.filter),
            ],
            fitOptions: resolveTitleCardSingleValueTextFitOptions(valueText),
        })}
        ${renderTitleCardUnitText({
            id: "title-card-unit",
            unitText: content.unitText,
            xCoordinate: singleValueLayout.unitXCoordinate,
            yCoordinate: singleValueLayout.unitYCoordinate,
            maxWidth: singleValueLayout.unitWidth,
            fontSize: singleValueLayout.unitFontSize,
            fill: config.unitTextColor,
            textStyle: config.textStyles.unit,
            textAnchor: "start",
            outline: config.textOutline,
        })}
    `;
}

export function renderTitleCardDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
    content: TitleCardDualMetricContent,
    staticTextColor: string,
): string {
    if (isWideKeySize(keySize)) {
        return renderWideTitleCardDualTextMetric(data, config, content, staticTextColor);
    }

    return renderSquareTitleCardDualTextMetric(data, config, content, keySize, staticTextColor);
}

function renderSquareTitleCardDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    content: TitleCardDualMetricContent,
    keySize: KeySize,
    staticTextColor: string,
): string {
    const layout = buildSquareTitleCardLayout(keySize);

    return `
        ${renderConstrainedSvgText({
            id: "title-card-dual-code",
            text: content.codeText,
            xCoordinate: layout.dualCodeX,
            yCoordinate: layout.dualCodeY,
            maxWidth: layout.dualCodeWidth,
            fontSize: layout.dualCodeFontSize * config.textStyles.title.fontSizeScale,
            fontFamily: config.textStyles.title.fontFamily,
            fontWeight: config.textStyles.title.fontWeight,
            fill: staticTextColor,
            textAnchor: "start",
            outline: config.textOutline,
            extraAttributes: buildSvgFilterAttributes(config.textStyles.title.filter),
        })}
        ${renderTitleCardCaptionColumn({
            idPrefix: "title-card-dual-caption",
            characters: titleCardCaptionCharacters(content.threeCharacterCaptionText),
            layout: layout.caption,
            fill: staticTextColor,
            textStyle: config.textStyles.title,
            outline: config.textOutline,
        })}
        ${renderTitleCardDualRow({
            rowId: "title-card-positive",
            content: {
                widgetData: data.positive,
                labelText: content.positiveLabelText,
                unitText: content.positiveUnitText,
                fill: config.positiveColor ?? config.valueTextColor,
            },
            layout: {
                yCoordinate: layout.dualPositiveY,
                labelXCoordinate: layout.dualChannelLabelX,
                valueXCoordinate: layout.dualValueX,
                valueWidth: layout.dualValueWidth,
                valueFontSize: layout.dualValueFontSize,
                unitXCoordinate: layout.dualUnitX,
                unitWidth: layout.dualUnitWidth,
                unitFontSize: layout.dualUnitFontSize,
            },
            config,
        })}
        ${renderTitleCardDualRow({
            rowId: "title-card-negative",
            content: {
                widgetData: data.negative,
                labelText: content.negativeLabelText,
                unitText: content.negativeUnitText,
                fill: config.negativeColor ?? config.valueTextColor,
            },
            layout: {
                yCoordinate: layout.dualNegativeY,
                labelXCoordinate: layout.dualChannelLabelX,
                valueXCoordinate: layout.dualValueX,
                valueWidth: layout.dualValueWidth,
                valueFontSize: layout.dualValueFontSize,
                unitXCoordinate: layout.dualUnitX,
                unitWidth: layout.dualUnitWidth,
                unitFontSize: layout.dualUnitFontSize,
            },
            config,
        })}
    `;
}

function renderWideTitleCardDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    content: TitleCardDualMetricContent,
    staticTextColor: string,
): string {
    return `
        ${renderTitleCardCaptionColumn({
            idPrefix: "title-card-dual-caption",
            characters: titleCardCaptionCharacters(content.threeCharacterCaptionText),
            layout: TITLE_CARD_WIDE_CAPTION_COLUMN_LAYOUT,
            fill: staticTextColor,
            textStyle: config.textStyles.title,
            outline: config.textOutline,
        })}
        ${renderTitleCardCodeLetters({
            idPrefix: "title-card-dual-code",
            codeText: content.compactCodeText,
            xStart: TITLE_CARD_DUAL_WIDE_LAYOUT.codeXStart,
            yCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.codeY,
            letterGap: TITLE_CARD_DUAL_WIDE_LAYOUT.codeLetterGap,
            fontSizes: TITLE_CARD_DUAL_WIDE_LAYOUT.codeFontSizes,
            fill: staticTextColor,
            textStyle: config.textStyles.smallLabel,
            outline: config.textOutline,
        })}
        ${renderTitleCardDualRow({
            rowId: "title-card-positive",
            content: {
                widgetData: data.positive,
                labelText: content.positiveLabelText,
                unitText: content.positiveUnitText,
                fill: config.positiveColor ?? config.valueTextColor,
            },
            layout: {
                yCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.positiveY,
                labelXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.channelLabelX,
                valueXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.valueX,
                valueWidth: TITLE_CARD_DUAL_WIDE_LAYOUT.valueWidth,
                valueFontSize: TITLE_CARD_DUAL_WIDE_LAYOUT.valueFontSize,
                unitXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.unitX,
                unitWidth: TITLE_CARD_DUAL_WIDE_LAYOUT.unitWidth,
                unitFontSize: TITLE_CARD_DUAL_WIDE_LAYOUT.unitFontSize,
            },
            config,
        })}
        ${renderTitleCardDualRow({
            rowId: "title-card-negative",
            content: {
                widgetData: data.negative,
                labelText: content.negativeLabelText,
                unitText: content.negativeUnitText,
                fill: config.negativeColor ?? config.valueTextColor,
            },
            layout: {
                yCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.negativeY,
                labelXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.channelLabelX,
                valueXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.valueX,
                valueWidth: TITLE_CARD_DUAL_WIDE_LAYOUT.valueWidth,
                valueFontSize: TITLE_CARD_DUAL_WIDE_LAYOUT.valueFontSize,
                unitXCoordinate: TITLE_CARD_DUAL_WIDE_LAYOUT.unitX,
                unitWidth: TITLE_CARD_DUAL_WIDE_LAYOUT.unitWidth,
                unitFontSize: TITLE_CARD_DUAL_WIDE_LAYOUT.unitFontSize,
            },
            config,
        })}
    `;
}

function buildSquareTitleCardLayout(keySize: KeySize) {
    const scale = Math.min(keySize.width, keySize.height) / TITLE_CARD_SQUARE_REFERENCE_SIZE;
    const xOffset = (keySize.width - TITLE_CARD_SQUARE_REFERENCE_SIZE * scale) / 2;
    const yOffset = (keySize.height - TITLE_CARD_SQUARE_REFERENCE_SIZE * scale) / 2;
    const xCoordinate = (referenceXCoordinate: number): number => xOffset + referenceXCoordinate * scale;
    const yCoordinate = (referenceYCoordinate: number): number => yOffset + referenceYCoordinate * scale;
    const length = (referenceLength: number): number => referenceLength * scale;

    return {
        codeX: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.codeX),
        codeY: yCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.codeY),
        codeWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.codeWidth),
        codeFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.codeFontSize),
        caption: {
            xCoordinate: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionX),
            maxWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionWidth),
            xScale: TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionXScale,
            yScale: TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionYScale,
            strokeWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionStrokeWidth),
            yCoordinates: TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionRowYCoordinates.map(yCoordinate),
            fontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.captionFontSize),
        },
        singleValueRows: {
            valueXCoordinate: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.valueX),
            valueWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.valueWidth),
            valueFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.valueFontSize),
            compactValueXCoordinate: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactValueX),
            compactValueWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactValueWidth),
            compactValueFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactValueFontSize),
            unitXCoordinate: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.unitX),
            unitWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.unitWidth),
            unitFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.unitFontSize),
            compactUnitXCoordinate: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactUnitX),
            compactUnitWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactUnitWidth),
            compactUnitFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.compactUnitFontSize),
            bottomYCoordinate: yCoordinate(TITLE_CARD_SQUARE_REFERENCE_SIZE),
            bottomGuard: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.valueBottomGuard),
        },
        dualCodeX: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualCodeX),
        dualCodeY: yCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualCodeY),
        dualCodeWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualCodeWidth),
        dualCodeFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualCodeFontSize),
        dualChannelLabelX: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualChannelLabelX),
        dualPositiveY: yCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualPositiveY),
        dualNegativeY: yCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualNegativeY),
        dualValueX: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualValueX),
        dualValueWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualValueWidth),
        dualValueFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualValueFontSize),
        dualUnitX: xCoordinate(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualUnitX),
        dualUnitWidth: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualUnitWidth),
        dualUnitFontSize: length(TITLE_CARD_SQUARE_REFERENCE_LAYOUT.dualUnitFontSize),
    };
}

function renderTitleCardCaptionColumn(options: {
    idPrefix: string;
    characters: readonly string[];
    layout: TitleCardCaptionColumnLayout;
    fill: string;
    textStyle: RenderTextStyle;
    outline: TextMetricConfig["textOutline"];
}): string {
    return options.characters.map((character, characterIndex) => {
        const fallbackYCoordinate = options.layout.yCoordinates[options.layout.yCoordinates.length - 1] ?? 0;
        const yCoordinate = options.layout.yCoordinates[characterIndex] ?? fallbackYCoordinate;
        const fontSize = options.layout.fontSize * options.textStyle.fontSizeScale;

        return renderConstrainedSvgText({
            id: `${options.idPrefix}-${characterIndex}`,
            text: character,
            xCoordinate: options.layout.xCoordinate,
            yCoordinate: yCoordinate + fontSize * options.textStyle.baselineShiftEm,
            maxWidth: options.layout.maxWidth,
            fontSize,
            fontFamily: options.textStyle.fontFamily,
            fontWeight: options.textStyle.fontWeight,
            fill: options.fill,
            textAnchor: "start",
            outline: options.outline,
            extraAttributes: [
                titleCardScaleTransformAttribute(
                    options.layout.xCoordinate,
                    yCoordinate,
                    options.layout.xScale,
                    options.layout.yScale,
                ),
                ...buildTitleCardStrokeAttributes(options.fill, options.layout.strokeWidth, options.outline),
                ...buildSvgFilterAttributes(options.textStyle.filter),
            ],
            clipHeight: fontSize * options.layout.yScale * 1.35,
            fitOptions: { minimumFontScale: 1, widthGuardRatio: 1 },
        });
    }).join("");
}

function titleCardCaptionCharacters(threeCharacterCaptionText: string): readonly string[] {
    const [firstCharacter = "", secondCharacter = "", thirdCharacter = ""] = Array.from(threeCharacterCaptionText);

    return [firstCharacter, secondCharacter, thirdCharacter];
}

function renderTitleCardCodeLetters(options: {
    idPrefix: string;
    codeText: string;
    xStart: number;
    yCoordinate: number;
    letterGap: number;
    fontSizes: readonly number[];
    fill: string;
    textStyle: RenderTextStyle;
    outline: TextMetricConfig["textOutline"];
}): string {
    return Array.from(options.codeText).slice(0, 3).map((letter, letterIndex) => {
        const baseFontSize = options.fontSizes[letterIndex] ?? options.fontSizes[options.fontSizes.length - 1] ?? 11;
        const fontSize = baseFontSize * options.textStyle.fontSizeScale;

        return renderConstrainedSvgText({
            id: `${options.idPrefix}-${letterIndex}`,
            text: letter,
            xCoordinate: options.xStart + options.letterGap * letterIndex,
            yCoordinate: options.yCoordinate + fontSize * options.textStyle.baselineShiftEm,
            maxWidth: options.letterGap,
            fontSize,
            fontFamily: options.textStyle.fontFamily,
            fontWeight: options.textStyle.fontWeight,
            fill: options.fill,
            textAnchor: "start",
            outline: options.outline,
            extraAttributes: [
                ...buildTitleCardStrokeAttributes(options.fill, 0.25, options.outline),
                ...buildSvgFilterAttributes(options.textStyle.filter),
            ],
            fitOptions: { minimumFontScale: 0.55, widthGuardRatio: 1 },
        });
    }).join("");
}

function resolveSquareTitleCardSingleValueLayout(
    valueText: string,
    layout: TitleCardSquareSingleValueRowLayout,
    valueTextStyle: RenderTextStyle,
): TitleCardSingleValueLayout {
    const usesCompactRow = isCompactTitleCardSingleValueText(valueText);
    const valueFontSize = usesCompactRow ? layout.compactValueFontSize : layout.valueFontSize;
    const valueWidth = usesCompactRow ? layout.compactValueWidth : layout.valueWidth;
    const unitFontSize = usesCompactRow ? layout.compactUnitFontSize : layout.unitFontSize;
    const unitWidth = usesCompactRow ? layout.compactUnitWidth : layout.unitWidth;

    return {
        valueXCoordinate: usesCompactRow ? layout.compactValueXCoordinate : layout.valueXCoordinate,
        valueYCoordinate: resolveBottomBiasedTextYCoordinate({
            text: valueText,
            fontSize: valueFontSize * valueTextStyle.fontSizeScale,
            fontWeight: valueTextStyle.fontWeight,
            maxWidth: valueWidth,
            bottomYCoordinate: layout.bottomYCoordinate,
            bottomGuard: layout.bottomGuard,
            fitOptions: resolveTitleCardSingleValueTextFitOptions(valueText),
        }),
        valueWidth,
        valueFontSize,
        unitXCoordinate: usesCompactRow ? layout.compactUnitXCoordinate : layout.unitXCoordinate,
        unitYCoordinate: resolveSquareTitleCardUnitYCoordinate(layout, unitFontSize),
        unitWidth,
        unitFontSize,
    };
}

function resolveSquareTitleCardUnitYCoordinate(
    layout: TitleCardSquareSingleValueRowLayout,
    unitFontSize: number,
): number {
    return layout.bottomYCoordinate - layout.bottomGuard - unitFontSize * TITLE_CARD_SINGLE_UNIT_BOTTOM_FONT_RATIO;
}

function resolveBottomBiasedTextYCoordinate(options: {
    readonly text: string;
    readonly fontSize: number;
    readonly fontWeight: number | string;
    readonly maxWidth: number;
    readonly bottomYCoordinate: number;
    readonly bottomGuard: number;
    readonly fitOptions: {
        readonly minimumFontScale?: number;
        readonly widthGuardRatio?: number;
    };
}): number {
    const textFit = resolveSvgTextFit({
        runs: [{
            text: options.text,
            fontSize: options.fontSize,
            fontWeight: options.fontWeight,
        }],
        maxWidth: options.maxWidth,
        fitOptions: options.fitOptions,
    });
    const renderedFontSize = options.fontSize * textFit.fontScale;

    return options.bottomYCoordinate - options.bottomGuard - renderedFontSize * TITLE_CARD_SINGLE_VALUE_BOTTOM_FONT_RATIO;
}

function resolveTitleCardSingleValueLayout(
    valueText: string,
    defaultLayout: TitleCardSingleValueLayout,
    compactLayout: TitleCardSingleValueLayout,
): TitleCardSingleValueLayout {
    if (isCompactTitleCardSingleValueText(valueText)) {
        return compactLayout;
    }

    return defaultLayout;
}

function renderTitleCardUnitText(options: {
    id: string;
    unitText: string;
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    fontSize: number;
    fill: string;
    textStyle: RenderTextStyle;
    textAnchor: "start" | "end";
    outline: TextMetricConfig["textOutline"];
}): string {
    if (options.unitText.length === 0) {
        return "";
    }

    const fontSize = options.fontSize * options.textStyle.fontSizeScale;

    return renderConstrainedSvgText({
        id: options.id,
        text: options.unitText,
        xCoordinate: options.xCoordinate,
        yCoordinate: options.yCoordinate + fontSize * options.textStyle.baselineShiftEm,
        maxWidth: options.maxWidth,
        fontSize,
        fontFamily: options.textStyle.fontFamily,
        fontWeight: options.textStyle.fontWeight,
        fill: options.fill,
        textAnchor: options.textAnchor,
        outline: options.outline,
        clipHeight: fontSize * options.textStyle.clipHeightEm,
        extraAttributes: buildSvgFilterAttributes(options.textStyle.filter),
        fitOptions: {
            ...TITLE_CARD_UNIT_TEXT_FIT_OPTIONS,
            minimumFontScale: Math.min(
                TITLE_CARD_UNIT_TEXT_FIT_OPTIONS.minimumFontScale,
                options.textStyle.minimumFontScale,
            ),
            widthScale: options.textStyle.widthScale,
        },
    });
}

function renderTitleCardChannelLabel(options: {
    id: string;
    labelText: string;
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    fontSize: number;
    fill: string;
    textStyle: RenderTextStyle;
    outline: TextMetricConfig["textOutline"];
}): string {
    if (options.labelText === "↑" || options.labelText === "↓") {
        return renderTitleCardDirectionIconFragment({
            id: options.id,
            direction: options.labelText === "↑" ? "up" : "down",
            xCoordinate: options.xCoordinate,
            yCoordinate: options.yCoordinate,
            fontSize: options.fontSize,
            fill: options.fill,
            filter: options.textStyle.filter,
            outline: options.outline,
        });
    }

    const fontSize = options.fontSize * options.textStyle.fontSizeScale;

    return renderConstrainedSvgText({
        id: options.id,
        text: options.labelText,
        xCoordinate: options.xCoordinate,
        yCoordinate: options.yCoordinate + fontSize * options.textStyle.baselineShiftEm,
        maxWidth: options.maxWidth,
        fontSize,
        fontFamily: options.textStyle.fontFamily,
        fontWeight: options.textStyle.fontWeight,
        fill: options.fill,
        textAnchor: "start",
        outline: options.outline,
        clipHeight: fontSize * options.textStyle.clipHeightEm,
        extraAttributes: buildSvgFilterAttributes(options.textStyle.filter),
    });
}

function renderTitleCardDualRow(options: {
    rowId: string; content: TitleCardDualRowContent; layout: TitleCardDualRowLayout; config: TextMetricConfig;
}): string {
    const valueText = options.content.widgetData.displayValue ?? options.content.widgetData.current.toFixed(0);
    const labelXCoordinate = options.layout.labelXCoordinate
        ?? options.layout.valueXCoordinate - options.layout.valueWidth + 8;
    const unitText = options.content.widgetData.unit.length === 0 ? "" : options.content.unitText;

    return `
        ${renderTitleCardChannelLabel({
            id: `${options.rowId}-label`,
            labelText: options.content.labelText,
            xCoordinate: labelXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: 24,
            fontSize: 13,
            fill: options.config.labelTextColor,
            textStyle: options.config.textStyles.smallLabel,
            outline: options.config.textOutline,
        })}
        ${renderConstrainedSvgText({
            id: `${options.rowId}-value`,
            text: valueText,
            xCoordinate: options.layout.valueXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: options.layout.valueWidth,
            fontSize: options.layout.valueFontSize * options.config.textStyles.value.fontSizeScale,
            fontFamily: options.config.textStyles.value.fontFamily,
            fontWeight: options.config.textStyles.value.fontWeight,
            fill: options.content.fill,
            textAnchor: "end",
            outline: options.config.textOutline,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(options.config.textStyles.value.filter),
            ],
            fitOptions: TITLE_CARD_VALUE_TEXT_FIT_OPTIONS,
        })}
        ${renderTitleCardUnitText({
            id: `${options.rowId}-unit`,
            unitText,
            xCoordinate: options.layout.unitXCoordinate,
            yCoordinate: options.layout.yCoordinate + options.layout.valueFontSize * TITLE_CARD_DUAL_UNIT_Y_OFFSET_RATIO,
            maxWidth: options.layout.unitWidth,
            fontSize: options.layout.unitFontSize,
            fill: options.config.unitTextColor,
            textStyle: options.config.textStyles.unit,
            textAnchor: options.layout.unitTextAnchor ?? "start",
            outline: options.config.textOutline,
        })}
    `;
}

function resolveTitleCardSingleValueTextFitOptions(valueText: string): {
    readonly minimumFontScale: number;
    readonly widthGuardRatio: number;
} {
    if (isCompactTitleCardSingleValueText(valueText)) {
        return TITLE_CARD_COMPACT_SINGLE_VALUE_TEXT_FIT_OPTIONS;
    }

    return TITLE_CARD_SINGLE_VALUE_TEXT_FIT_OPTIONS;
}

function isCompactTitleCardSingleValueText(valueText: string): boolean {
    return Array.from(valueText).length >= 3;
}

function buildTitleCardStrokeAttributes(
    fill: string,
    strokeWidth: number,
    outline: TextMetricConfig["textOutline"],
): readonly string[] {
    // Title-card's legacy same-color stroke is a weight tweak; transparent
    // outlines replace it so one text element never emits competing stroke attrs.
    if (isSvgOutlineEnabled(outline)) {
        return [];
    }

    return [`stroke="${escapeSvgText(fill)}"`, `stroke-width="${formatSvgNumber(strokeWidth)}"`, "paint-order=\"stroke fill\""];
}

function titleCardScaleTransformAttribute(xCoordinate: number, yCoordinate: number, xScale: number, yScale: number): string {
    const origin = `${formatSvgNumber(xCoordinate)} ${formatSvgNumber(yCoordinate)}`;
    const scale = `${formatSvgNumber(xScale)} ${formatSvgNumber(yScale)}`;
    const inverseOrigin = `${formatSvgNumber(-xCoordinate)} ${formatSvgNumber(-yCoordinate)}`;
    return `transform="translate(${origin}) scale(${scale}) translate(${inverseOrigin})"`;
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isWideKeySize(keySize: KeySize): boolean {
    return keySize.width > keySize.height;
}

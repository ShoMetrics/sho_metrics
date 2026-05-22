import type { DualChannelWidgetData, KeySize, WidgetData } from "../../view-rendering/widget-data";
import { resolveColorForThresholdValue } from "../../view-rendering/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../../view-rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    resolveRenderTextStyleFontSize,
    type RenderTextStyles,
} from "../../view-rendering/render-text-style";
import {
    renderConstrainedSvgText,
} from "../../view-rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget-contract";

export interface TextMetricConfig extends WidgetBaseConfig {
    labelTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    secondaryTextColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    positiveColor?: string;
    negativeColor?: string;
}

export interface DualTextMetricChannelContent {
    readonly labelText: string;
    readonly unitText: string;
}

export interface DualTextMetricContent {
    readonly titleText: string;
    readonly positive: DualTextMetricChannelContent;
    readonly negative: DualTextMetricChannelContent;
}

export const DEFAULT_TEXT_METRIC_CONFIG: TextMetricConfig = {
    colorConfig: { mode: "solid", solidColor: "#e6e6e6", thresholds: [], isGradientEnabled: false },
    labelTextColor: "rgba(255,255,255,0.70)",
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    secondaryTextColor: "rgba(255,255,255,0.52)",
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
};

const SINGLE_TEXT_SQUARE_LAYOUT = {
    horizontalPadding: 14,
    labelYRatio: 0.16,
    valueYRatio: 0.54,
    unitYRatio: 0.87,
    labelFontSize: 18,
    valueFontSize: 82,
    unitFontSize: 20,
} as const;

const SINGLE_TEXT_WIDE_LAYOUT = {
    labelWidth: 52,
    labelXOffset: 14,
    labelYRatio: 0.52,
    valueXRatio: 0.56,
    valueYRatio: 0.56,
    valueWidthRatio: 0.50,
    unitRightPadding: 14,
    unitYRatio: 0.68,
    labelFontSize: 17,
    valueFontSize: 78,
    unitFontSize: 18,
} as const;

const DUAL_TEXT_SQUARE_LAYOUT = {
    titleYRatio: 0.17,
    firstRowYRatio: 0.46,
    secondRowYRatio: 0.73,
    horizontalPadding: 14,
    valueXRatio: 0.75,
    labelWidthRatio: 0.16,
    valueWidthRatio: 0.48,
    unitWidthRatio: 0.16,
    titleFontSize: 17,
    labelFontSize: 14,
    valueFontSize: 41,
    unitFontSize: 20,
    unitYOffset: 7,
} as const;

const DUAL_TEXT_WIDE_LAYOUT = {
    titleXOffset: 14,
    titleYRatio: 0.52,
    firstRowYRatio: 0.36,
    secondRowYRatio: 0.68,
    labelXRatio: 0.27,
    valueXRatio: 0.78,
    unitXRatio: 0.93,
    labelWidthRatio: 0.14,
    valueWidthRatio: 0.34,
    unitWidthRatio: 0.18,
    titleFontSize: 16,
    labelFontSize: 16,
    valueFontSize: 36,
    unitFontSize: 18,
    unitYOffset: 6,
} as const;

const VALUE_TEXT_FIT_OPTIONS = { minimumFontScale: 0.44, widthGuardRatio: 1.08 } as const;
const UNIT_TEXT_FIT_OPTIONS = { minimumFontScale: 0.55, widthGuardRatio: 1.16 } as const;

export const textMetric: Widget<TextMetricConfig> = {
    widgetId: "text-metric",

    render(data: WidgetData, config: TextMetricConfig, keySize: KeySize): string {
        if (isWideKeySize(keySize)) {
            return renderWideTextMetric(data, config, keySize);
        }

        return renderSquareTextMetric(data, config, keySize);
    },
};

export function renderDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
    content: DualTextMetricContent,
): string {
    if (isWideKeySize(keySize)) {
        return renderWideDualTextMetric(data, config, keySize, content);
    }

    return renderSquareDualTextMetric(data, config, keySize, content);
}

function renderSquareTextMetric(data: WidgetData, config: TextMetricConfig, keySize: KeySize): string {
    const centerXCoordinate = keySize.width / 2;
    const textWidth = Math.max(24, keySize.width - SINGLE_TEXT_SQUARE_LAYOUT.horizontalPadding * 2);
    const valueText = data.displayValue ?? data.current.toFixed(0);
    const valueTextColor = resolveColorForThresholdValue(data.current, config.colorConfig);
    const labelTextStyle = config.textStyles.label;
    const valueTextStyle = config.textStyles.value;
    const unitTextStyle = config.textStyles.unit;

    return `
        ${renderConstrainedSvgText({
            id: "text-metric-label",
            text: data.label,
            xCoordinate: centerXCoordinate,
            yCoordinate: keySize.height * SINGLE_TEXT_SQUARE_LAYOUT.labelYRatio,
            maxWidth: textWidth,
            fontSize: resolveRenderTextStyleFontSize(SINGLE_TEXT_SQUARE_LAYOUT.labelFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: config.labelTextColor,
            textAnchor: "middle",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderConstrainedSvgText({
            id: "text-metric-value",
            text: valueText,
            xCoordinate: centerXCoordinate,
            yCoordinate: keySize.height * SINGLE_TEXT_SQUARE_LAYOUT.valueYRatio,
            maxWidth: textWidth,
            fontSize: resolveRenderTextStyleFontSize(SINGLE_TEXT_SQUARE_LAYOUT.valueFontSize, valueTextStyle),
            fontFamily: valueTextStyle.fontFamily,
            fontWeight: valueTextStyle.fontWeight,
            fill: valueTextColor,
            textAnchor: "middle",
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: VALUE_TEXT_FIT_OPTIONS,
        })}
        ${renderUnitText({
            id: "text-metric-unit",
            unitText: data.unit,
            xCoordinate: centerXCoordinate,
            yCoordinate: keySize.height * SINGLE_TEXT_SQUARE_LAYOUT.unitYRatio,
            textWidth,
            fontSize: SINGLE_TEXT_SQUARE_LAYOUT.unitFontSize,
            config,
            textStyle: unitTextStyle,
            textAnchor: "middle",
        })}
    `;
}

function renderWideTextMetric(data: WidgetData, config: TextMetricConfig, keySize: KeySize): string {
    const valueText = data.displayValue ?? data.current.toFixed(0);
    const valueTextColor = resolveColorForThresholdValue(data.current, config.colorConfig);
    const labelTextStyle = config.textStyles.label;
    const valueTextStyle = config.textStyles.value;
    const unitTextStyle = config.textStyles.unit;
    const valueWidth = Math.max(
        48,
        keySize.width * SINGLE_TEXT_WIDE_LAYOUT.valueWidthRatio,
    );
    const valueXCoordinate = keySize.width * SINGLE_TEXT_WIDE_LAYOUT.valueXRatio;

    return `
        ${renderConstrainedSvgText({
            id: "text-metric-label",
            text: data.label,
            xCoordinate: SINGLE_TEXT_WIDE_LAYOUT.labelXOffset,
            yCoordinate: keySize.height * SINGLE_TEXT_WIDE_LAYOUT.labelYRatio,
            maxWidth: SINGLE_TEXT_WIDE_LAYOUT.labelWidth,
            fontSize: resolveRenderTextStyleFontSize(SINGLE_TEXT_WIDE_LAYOUT.labelFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: config.labelTextColor,
            textAnchor: "start",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderConstrainedSvgText({
            id: "text-metric-value",
            text: valueText,
            xCoordinate: valueXCoordinate,
            yCoordinate: keySize.height * SINGLE_TEXT_WIDE_LAYOUT.valueYRatio,
            maxWidth: valueWidth,
            fontSize: resolveRenderTextStyleFontSize(SINGLE_TEXT_WIDE_LAYOUT.valueFontSize, valueTextStyle),
            fontFamily: valueTextStyle.fontFamily,
            fontWeight: valueTextStyle.fontWeight,
            fill: valueTextColor,
            textAnchor: "middle",
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: VALUE_TEXT_FIT_OPTIONS,
        })}
        ${renderUnitText({
            id: "text-metric-unit",
            unitText: data.unit,
            xCoordinate: keySize.width - SINGLE_TEXT_WIDE_LAYOUT.unitRightPadding,
            yCoordinate: keySize.height * SINGLE_TEXT_WIDE_LAYOUT.unitYRatio,
            textWidth: SINGLE_TEXT_WIDE_LAYOUT.labelWidth,
            fontSize: SINGLE_TEXT_WIDE_LAYOUT.unitFontSize,
            config,
            textStyle: unitTextStyle,
            textAnchor: "end",
        })}
    `;
}

function renderSquareDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
    content: DualTextMetricContent,
): string {
    const labelTextStyle = config.textStyles.label;

    return `
        ${renderConstrainedSvgText({
            id: "text-metric-dual-title",
            text: content.titleText,
            xCoordinate: keySize.width / 2,
            yCoordinate: keySize.height * DUAL_TEXT_SQUARE_LAYOUT.titleYRatio,
            maxWidth: keySize.width * 0.74,
            fontSize: resolveRenderTextStyleFontSize(DUAL_TEXT_SQUARE_LAYOUT.titleFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: config.labelTextColor,
            textAnchor: "middle",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderDualTextRow({
            rowId: "text-metric-positive",
            widgetData: data.positive,
            labelText: content.positive.labelText,
            unitText: content.positive.unitText,
            yCoordinate: keySize.height * DUAL_TEXT_SQUARE_LAYOUT.firstRowYRatio,
            valueFill: config.positiveColor ?? config.valueTextColor,
            labelXCoordinate: DUAL_TEXT_SQUARE_LAYOUT.horizontalPadding,
            valueXCoordinate: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.valueXRatio,
            unitXCoordinate: keySize.width - DUAL_TEXT_SQUARE_LAYOUT.horizontalPadding,
            labelWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.labelWidthRatio,
            valueWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.valueWidthRatio,
            unitWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.unitWidthRatio,
            labelFontSize: DUAL_TEXT_SQUARE_LAYOUT.labelFontSize,
            valueFontSize: DUAL_TEXT_SQUARE_LAYOUT.valueFontSize,
            unitFontSize: DUAL_TEXT_SQUARE_LAYOUT.unitFontSize,
            unitYOffset: DUAL_TEXT_SQUARE_LAYOUT.unitYOffset,
            config,
        })}
        ${renderDualTextRow({
            rowId: "text-metric-negative",
            widgetData: data.negative,
            labelText: content.negative.labelText,
            unitText: content.negative.unitText,
            yCoordinate: keySize.height * DUAL_TEXT_SQUARE_LAYOUT.secondRowYRatio,
            valueFill: config.negativeColor ?? config.valueTextColor,
            labelXCoordinate: DUAL_TEXT_SQUARE_LAYOUT.horizontalPadding,
            valueXCoordinate: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.valueXRatio,
            unitXCoordinate: keySize.width - DUAL_TEXT_SQUARE_LAYOUT.horizontalPadding,
            labelWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.labelWidthRatio,
            valueWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.valueWidthRatio,
            unitWidth: keySize.width * DUAL_TEXT_SQUARE_LAYOUT.unitWidthRatio,
            labelFontSize: DUAL_TEXT_SQUARE_LAYOUT.labelFontSize,
            valueFontSize: DUAL_TEXT_SQUARE_LAYOUT.valueFontSize,
            unitFontSize: DUAL_TEXT_SQUARE_LAYOUT.unitFontSize,
            unitYOffset: DUAL_TEXT_SQUARE_LAYOUT.unitYOffset,
            config,
        })}
    `;
}

function renderWideDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
    content: DualTextMetricContent,
): string {
    const labelTextStyle = config.textStyles.label;

    return `
        ${renderConstrainedSvgText({
            id: "text-metric-dual-title",
            text: content.titleText,
            xCoordinate: DUAL_TEXT_WIDE_LAYOUT.titleXOffset,
            yCoordinate: keySize.height * DUAL_TEXT_WIDE_LAYOUT.titleYRatio,
            maxWidth: SINGLE_TEXT_WIDE_LAYOUT.labelWidth,
            fontSize: resolveRenderTextStyleFontSize(DUAL_TEXT_WIDE_LAYOUT.titleFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: config.labelTextColor,
            textAnchor: "start",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderDualTextRow({
            rowId: "text-metric-positive",
            widgetData: data.positive,
            labelText: content.positive.labelText,
            unitText: content.positive.unitText,
            yCoordinate: keySize.height * DUAL_TEXT_WIDE_LAYOUT.firstRowYRatio,
            valueFill: config.positiveColor ?? config.valueTextColor,
            labelXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.labelXRatio,
            valueXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.valueXRatio,
            unitXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.unitXRatio,
            labelWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.labelWidthRatio,
            valueWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.valueWidthRatio,
            unitWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.unitWidthRatio,
            labelFontSize: DUAL_TEXT_WIDE_LAYOUT.labelFontSize,
            valueFontSize: DUAL_TEXT_WIDE_LAYOUT.valueFontSize,
            unitFontSize: DUAL_TEXT_WIDE_LAYOUT.unitFontSize,
            unitYOffset: DUAL_TEXT_WIDE_LAYOUT.unitYOffset,
            config,
        })}
        ${renderDualTextRow({
            rowId: "text-metric-negative",
            widgetData: data.negative,
            labelText: content.negative.labelText,
            unitText: content.negative.unitText,
            yCoordinate: keySize.height * DUAL_TEXT_WIDE_LAYOUT.secondRowYRatio,
            valueFill: config.negativeColor ?? config.valueTextColor,
            labelXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.labelXRatio,
            valueXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.valueXRatio,
            unitXCoordinate: keySize.width * DUAL_TEXT_WIDE_LAYOUT.unitXRatio,
            labelWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.labelWidthRatio,
            valueWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.valueWidthRatio,
            unitWidth: keySize.width * DUAL_TEXT_WIDE_LAYOUT.unitWidthRatio,
            labelFontSize: DUAL_TEXT_WIDE_LAYOUT.labelFontSize,
            valueFontSize: DUAL_TEXT_WIDE_LAYOUT.valueFontSize,
            unitFontSize: DUAL_TEXT_WIDE_LAYOUT.unitFontSize,
            unitYOffset: DUAL_TEXT_WIDE_LAYOUT.unitYOffset,
            config,
        })}
    `;
}

function renderDualTextRow(options: {
    rowId: string;
    widgetData: WidgetData;
    labelText: string;
    unitText: string;
    yCoordinate: number;
    valueFill: string;
    labelXCoordinate: number;
    valueXCoordinate: number;
    unitXCoordinate: number;
    labelWidth: number;
    valueWidth: number;
    unitWidth: number;
    labelFontSize: number;
    valueFontSize: number;
    unitFontSize: number;
    unitYOffset: number;
    config: TextMetricConfig;
}): string {
    const valueText = options.widgetData.displayValue ?? options.widgetData.current.toFixed(0);
    const labelTextStyle = options.config.textStyles.label;
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;

    return `
        ${renderConstrainedSvgText({
            id: `${options.rowId}-label`,
            text: options.labelText,
            xCoordinate: options.labelXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: options.labelWidth,
            fontSize: resolveRenderTextStyleFontSize(options.labelFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: options.config.labelTextColor,
            textAnchor: "start",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderConstrainedSvgText({
            id: `${options.rowId}-value`,
            text: valueText,
            xCoordinate: options.valueXCoordinate,
            yCoordinate: options.yCoordinate,
            maxWidth: options.valueWidth,
            fontSize: resolveRenderTextStyleFontSize(options.valueFontSize, valueTextStyle),
            fontFamily: valueTextStyle.fontFamily,
            fontWeight: valueTextStyle.fontWeight,
            fill: options.valueFill,
            textAnchor: "end",
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
            fitOptions: VALUE_TEXT_FIT_OPTIONS,
        })}
        ${renderConstrainedSvgText({
            id: `${options.rowId}-unit`,
            text: options.unitText,
            xCoordinate: options.unitXCoordinate,
            yCoordinate: options.yCoordinate + options.unitYOffset,
            maxWidth: options.unitWidth,
            fontSize: resolveRenderTextStyleFontSize(options.unitFontSize, unitTextStyle),
            fontFamily: unitTextStyle.fontFamily,
            fontWeight: unitTextStyle.fontWeight,
            fill: options.config.unitTextColor,
            textAnchor: "end",
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            fitOptions: UNIT_TEXT_FIT_OPTIONS,
        })}
    `;
}

function renderUnitText(options: {
    id: string;
    unitText: string;
    xCoordinate: number;
    yCoordinate: number;
    textWidth: number;
    fontSize: number;
    config: TextMetricConfig;
    textStyle: TextMetricConfig["textStyles"]["unit"];
    textAnchor: "start" | "middle" | "end";
}): string {
    if (options.unitText.length === 0) {
        return "";
    }

    return renderConstrainedSvgText({
        id: options.id,
        text: options.unitText,
        xCoordinate: options.xCoordinate,
        yCoordinate: options.yCoordinate,
        maxWidth: options.textWidth,
        fontSize: resolveRenderTextStyleFontSize(options.fontSize, options.textStyle),
        fontFamily: options.textStyle.fontFamily,
        fontWeight: options.textStyle.fontWeight,
        fill: options.config.unitTextColor,
        textAnchor: options.textAnchor,
        extraAttributes: buildSvgFilterAttributes(options.textStyle.filter),
        fitOptions: UNIT_TEXT_FIT_OPTIONS,
    });
}

function isWideKeySize(keySize: KeySize): boolean {
    return keySize.width > keySize.height;
}

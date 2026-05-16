import type { DualChannelWidgetData, KeySize, WidgetData } from "../../rendering/widget-data";
import { resolveColorForThresholdValue } from "../../rendering/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
    type RenderGraphicEffectTokens,
} from "../../rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    resolveRenderTextStyleFontSize,
    type RenderTextStyles,
} from "../../rendering/render-text-style";
import {
    renderConstrainedSvgText,
} from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";
import { renderMetricTextRow } from "./metric-text-row";

export interface TextMetricConfig extends WidgetBaseConfig {
    labelTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    secondaryTextColor: string;
    textStyles: RenderTextStyles;
    graphicEffects: RenderGraphicEffectTokens;
    positiveColor?: string;
    negativeColor?: string;
}

export const DEFAULT_TEXT_METRIC_CONFIG: TextMetricConfig = {
    colorConfig: { mode: "solid", solidColor: "#3b82f6", thresholds: [], isGradientEnabled: true },
    labelTextColor: "rgba(255,255,255,0.70)",
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    secondaryTextColor: "rgba(255,255,255,0.52)",
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    graphicEffects: DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
};

const TEXT_LAYOUT = {
    horizontalPadding: 14,
    labelYRatio: 0.27,
    valueYRatio: 0.52,
    secondaryYRatio: 0.76,
    labelFontSize: 22,
    valueFontSize: 48,
    unitFontSize: 19,
    secondaryFontSize: 15,
    dualLabelFontSize: 16,
    dualValueFontSize: 29,
    dualUnitFontSize: 14,
    dualUpperYRatio: 0.36,
    dualLowerYRatio: 0.68,
} as const;

export const textMetric: Widget<TextMetricConfig> = {
    widgetId: "text-metric",

    render(data: WidgetData, config: TextMetricConfig, keySize: KeySize): string {
        const centerXCoordinate = keySize.width / 2;
        const textWidth = Math.max(24, keySize.width - TEXT_LAYOUT.horizontalPadding * 2);
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
                yCoordinate: keySize.height * TEXT_LAYOUT.labelYRatio,
                maxWidth: textWidth,
                fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.labelFontSize, labelTextStyle),
                fontFamily: labelTextStyle.fontFamily,
                fontWeight: labelTextStyle.fontWeight,
                fill: config.labelTextColor,
                textAnchor: "middle",
                extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
            })}
            ${renderMetricTextRow({
                id: "text-metric-value",
                layout: {
                    xCoordinate: centerXCoordinate,
                    yCoordinate: keySize.height * TEXT_LAYOUT.valueYRatio,
                    width: textWidth,
                    textAnchor: "middle",
                },
                value: {
                    text: valueText,
                    fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.valueFontSize, valueTextStyle),
                    fontFamily: valueTextStyle.fontFamily,
                    fontWeight: valueTextStyle.fontWeight,
                    fill: valueTextColor,
                    extraAttributes: [
                        "font-variant-numeric=\"tabular-nums\"",
                        ...buildSvgFilterAttributes(valueTextStyle.filter),
                    ],
                },
                unit: {
                    text: data.unit,
                    fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.unitFontSize, unitTextStyle),
                    fontFamily: unitTextStyle.fontFamily,
                    fontWeight: unitTextStyle.fontWeight,
                    fill: config.unitTextColor,
                    extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
                },
                fitOptions: data.unit.length > 1
                    ? { minimumFontScale: 0.48, widthGuardRatio: 1.36 }
                    : undefined,
            })}
            ${renderSecondaryText(data.secondaryDisplayValue, config, centerXCoordinate, textWidth, keySize)}
        `;
    },
};

export function renderDualTextMetric(
    data: DualChannelWidgetData,
    config: TextMetricConfig,
    keySize: KeySize,
): string {
    const centerXCoordinate = keySize.width / 2;
    const textWidth = Math.max(24, keySize.width - TEXT_LAYOUT.horizontalPadding * 2);

    return `
        ${renderDualTextRow({
            rowId: "text-metric-positive",
            widgetData: data.positive,
            yCoordinate: keySize.height * TEXT_LAYOUT.dualUpperYRatio,
            valueFill: config.positiveColor ?? config.valueTextColor,
            centerXCoordinate,
            textWidth,
            config,
        })}
        ${renderDualTextRow({
            rowId: "text-metric-negative",
            widgetData: data.negative,
            yCoordinate: keySize.height * TEXT_LAYOUT.dualLowerYRatio,
            valueFill: config.negativeColor ?? config.valueTextColor,
            centerXCoordinate,
            textWidth,
            config,
        })}
    `;
}

function renderSecondaryText(
    secondaryDisplayValue: string | undefined,
    config: TextMetricConfig,
    centerXCoordinate: number,
    textWidth: number,
    keySize: KeySize,
): string {
    if (!secondaryDisplayValue) {
        return "";
    }
    const textStyle = config.textStyles.smallLabel;

    return renderConstrainedSvgText({
        id: "text-metric-secondary",
        text: secondaryDisplayValue,
        xCoordinate: centerXCoordinate,
        yCoordinate: keySize.height * TEXT_LAYOUT.secondaryYRatio,
        maxWidth: textWidth,
        fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.secondaryFontSize, textStyle),
        fontFamily: textStyle.fontFamily,
        fontWeight: textStyle.fontWeight,
        fill: config.secondaryTextColor,
        textAnchor: "middle",
        extraAttributes: buildSvgFilterAttributes(textStyle.filter),
        fitOptions: { minimumFontScale: 0.58 },
    });
}

function renderDualTextRow(options: {
    rowId: string;
    widgetData: WidgetData;
    yCoordinate: number;
    valueFill: string;
    centerXCoordinate: number;
    textWidth: number;
    config: TextMetricConfig;
}): string {
    const labelYCoordinate = options.yCoordinate - TEXT_LAYOUT.dualValueFontSize * 0.64;
    const valueText = options.widgetData.displayValue ?? options.widgetData.current.toFixed(0);
    const labelTextStyle = options.config.textStyles.label;
    const valueTextStyle = options.config.textStyles.value;
    const unitTextStyle = options.config.textStyles.unit;

    return `
        ${renderConstrainedSvgText({
            id: `${options.rowId}-label`,
            text: options.widgetData.label,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: labelYCoordinate,
            maxWidth: options.textWidth,
            fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.dualLabelFontSize, labelTextStyle),
            fontFamily: labelTextStyle.fontFamily,
            fontWeight: labelTextStyle.fontWeight,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
            extraAttributes: buildSvgFilterAttributes(labelTextStyle.filter),
        })}
        ${renderMetricTextRow({
            id: `${options.rowId}-value`,
            layout: {
                xCoordinate: options.centerXCoordinate,
                yCoordinate: options.yCoordinate,
                width: options.textWidth,
                textAnchor: "middle",
            },
            value: {
                text: valueText,
                fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.dualValueFontSize, valueTextStyle),
                fontFamily: valueTextStyle.fontFamily,
                fontWeight: valueTextStyle.fontWeight,
                fill: options.valueFill,
                extraAttributes: [
                    "font-variant-numeric=\"tabular-nums\"",
                    ...buildSvgFilterAttributes(valueTextStyle.filter),
                ],
            },
            unit: {
                text: options.widgetData.unit,
                fontSize: resolveRenderTextStyleFontSize(TEXT_LAYOUT.dualUnitFontSize, unitTextStyle),
                fontFamily: unitTextStyle.fontFamily,
                fontWeight: unitTextStyle.fontWeight,
                fill: options.config.unitTextColor,
                extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            },
            fitOptions: options.widgetData.unit.length > 1
                ? { minimumFontScale: 0.50, widthGuardRatio: 1.34 }
                : undefined,
        })}
    `;
}

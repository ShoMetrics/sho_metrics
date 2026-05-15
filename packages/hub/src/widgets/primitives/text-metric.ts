import type { DualChannelWidgetData, KeySize, WidgetData } from "../../rendering/widget-data";
import { resolveColorForThresholdValue } from "../../rendering/color-resolver";
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
    positiveColor?: string;
    negativeColor?: string;
}

export const DEFAULT_TEXT_METRIC_CONFIG: TextMetricConfig = {
    colorConfig: { mode: "solid", solidColor: "#3b82f6", thresholds: [], isGradientEnabled: true },
    labelTextColor: "rgba(255,255,255,0.70)",
    valueTextColor: "white",
    unitTextColor: "rgba(255,255,255,0.74)",
    secondaryTextColor: "rgba(255,255,255,0.52)",
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

const TEXT_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";

export const textMetric: Widget<TextMetricConfig> = {
    widgetId: "text-metric",

    render(data: WidgetData, config: TextMetricConfig, keySize: KeySize): string {
        const centerXCoordinate = keySize.width / 2;
        const textWidth = Math.max(24, keySize.width - TEXT_LAYOUT.horizontalPadding * 2);
        const valueText = data.displayValue ?? data.current.toFixed(0);
        const valueTextColor = resolveColorForThresholdValue(data.current, config.colorConfig);

        return `
            ${renderConstrainedSvgText({
                id: "text-metric-label",
                text: data.label,
                xCoordinate: centerXCoordinate,
                yCoordinate: keySize.height * TEXT_LAYOUT.labelYRatio,
                maxWidth: textWidth,
                fontSize: TEXT_LAYOUT.labelFontSize,
                fontFamily: TEXT_FONT_FAMILY,
                fontWeight: 800,
                fill: config.labelTextColor,
                textAnchor: "middle",
            })}
            ${renderMetricTextRow({
                id: "text-metric-value",
                valueText,
                unitText: data.unit,
                xCoordinate: centerXCoordinate,
                yCoordinate: keySize.height * TEXT_LAYOUT.valueYRatio,
                width: textWidth,
                valueFontSize: TEXT_LAYOUT.valueFontSize,
                unitFontSize: TEXT_LAYOUT.unitFontSize,
                fontFamily: TEXT_FONT_FAMILY,
                valueFontWeight: 900,
                unitFontWeight: 800,
                valueFill: valueTextColor,
                unitFill: config.unitTextColor,
                textAnchor: "middle",
                valueExtraAttributes: ["font-variant-numeric=\"tabular-nums\""],
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

    return renderConstrainedSvgText({
        id: "text-metric-secondary",
        text: secondaryDisplayValue,
        xCoordinate: centerXCoordinate,
        yCoordinate: keySize.height * TEXT_LAYOUT.secondaryYRatio,
        maxWidth: textWidth,
        fontSize: TEXT_LAYOUT.secondaryFontSize,
        fontFamily: TEXT_FONT_FAMILY,
        fontWeight: 720,
        fill: config.secondaryTextColor,
        textAnchor: "middle",
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

    return `
        ${renderConstrainedSvgText({
            id: `${options.rowId}-label`,
            text: options.widgetData.label,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: labelYCoordinate,
            maxWidth: options.textWidth,
            fontSize: TEXT_LAYOUT.dualLabelFontSize,
            fontFamily: TEXT_FONT_FAMILY,
            fontWeight: 800,
            fill: options.config.labelTextColor,
            textAnchor: "middle",
        })}
        ${renderMetricTextRow({
            id: `${options.rowId}-value`,
            valueText,
            unitText: options.widgetData.unit,
            xCoordinate: options.centerXCoordinate,
            yCoordinate: options.yCoordinate,
            width: options.textWidth,
            valueFontSize: TEXT_LAYOUT.dualValueFontSize,
            unitFontSize: TEXT_LAYOUT.dualUnitFontSize,
            fontFamily: TEXT_FONT_FAMILY,
            valueFontWeight: 900,
            unitFontWeight: 800,
            valueFill: options.valueFill,
            unitFill: options.config.unitTextColor,
            textAnchor: "middle",
            valueExtraAttributes: ["font-variant-numeric=\"tabular-nums\""],
            fitOptions: options.widgetData.unit.length > 1
                ? { minimumFontScale: 0.50, widthGuardRatio: 1.34 }
                : undefined,
        })}
    `;
}

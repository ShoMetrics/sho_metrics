import type { WidgetData, KeySize } from "../../view-rendering/widget-data";
import { resolveColorForThresholdValue } from "../../view-rendering/color-resolver";
import {
    buildSvgFilterAttributes,
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../../view-rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../../view-rendering/render-text-style";
import {
    adjustHexColorBrightness,
    clamp,
    renderStyledSvgText,
} from "../../view-rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget-contract";
import { renderMetricTextRow } from "./metric-text-row";

export interface ProgressBarConfig extends WidgetBaseConfig {
    barHeight: number;
    borderRadius: number;
    paints: ProgressBarPaints;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    topIconFragment?: string;
}

export interface ProgressBarPaints {
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly supportingText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly track: string;
}

export const DEFAULT_PROGRESS_BAR_CONFIG: ProgressBarConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ], isGradientEnabled: true },
    barHeight: 14,
    borderRadius: 7,
    paints: {
        primaryText: "white",
        secondaryText: "rgba(255,255,255,0.88)",
        supportingText: "rgba(255,255,255,0.76)",
        mutedText: "rgba(255,255,255,0.78)",
        icon: "rgba(255,255,255,0.88)",
        track: "rgba(255,255,255,0.08)",
    },
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    gradientHeadAdjustmentPercent: -15,
};

type ProgressBarLayoutMode = "square" | "wide";

interface ProgressBarLayoutPlan {
    mode: ProgressBarLayoutMode;
    padding: number;
    title: TextLineLayout;
    singleValue: ValueLineLayout;
    singleBar: BarLayout;
    singleSecondaryText: TextLineLayout;
    channelValueFontSize: number;
    channelUnitFontSize: number;
    channelIconScale: number;
    channelBarHeight: number;
}

interface TextLineLayout {
    xCoordinate: number;
    yCoordinate: number;
    fontSize: number;
    maxWidth: number;
}

interface ValueLineLayout extends TextLineLayout {
    unitFontSize: number;
}

interface BarLayout {
    xCoordinate: number;
    yCoordinate: number;
    width: number;
    height: number;
    radius: number;
}

interface ChannelLayout {
    value: ValueLineLayout;
    bar: BarLayout;
    iconCenterXCoordinate: number;
    iconCenterYCoordinate: number;
}

/**
 * Progress bar. Full width = 100%.
 * Renders compact hardware and network layouts for square keys and wide touch strips.
 */
export const progressBar: Widget<ProgressBarConfig> = {
    widgetId: "progress-bar",

    render(data: WidgetData, config: ProgressBarConfig, keySize: KeySize): string {
        const layoutPlan = buildProgressBarLayoutPlan(keySize, config);

        if (data.barChannels && data.barChannels.length > 0) {
            return renderChannelBars(data, config, keySize, layoutPlan);
        }

        return renderSingleBar(data, config, keySize, layoutPlan);
    },
};

function buildProgressBarLayoutPlan(keySize: KeySize, config: ProgressBarConfig): ProgressBarLayoutPlan {
    const aspectRatio = keySize.width / keySize.height;
    const mode: ProgressBarLayoutMode = aspectRatio >= 1.45 ? "wide" : "square";
    const minimumSize = Math.min(keySize.width, keySize.height);
    const padding = Math.round(minimumSize * (mode === "wide" ? 0.12 : 0.105));
    const contentWidth = keySize.width - padding * 2;
    const barHeight = clamp(Math.round(minimumSize * 0.095), 8, config.barHeight);

    if (mode === "wide") {
        return {
            mode,
            padding,
            title: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.24),
                fontSize: clamp(Math.round(keySize.height * 0.18), 14, 18),
                maxWidth: contentWidth,
            },
            singleValue: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.62),
                fontSize: clamp(Math.round(keySize.height * 0.32), 26, 34),
                unitFontSize: clamp(Math.round(keySize.height * 0.17), 14, 18),
                maxWidth: Math.round(keySize.width * 0.42),
            },
            singleBar: {
                xCoordinate: Math.round(keySize.width * 0.54),
                yCoordinate: Math.round(keySize.height * 0.66),
                width: Math.round(keySize.width * 0.36),
                height: barHeight,
                radius: barHeight / 2,
            },
            singleSecondaryText: {
                xCoordinate: Math.round(keySize.width * 0.54),
                yCoordinate: Math.round(keySize.height * 0.43),
                fontSize: clamp(Math.round(keySize.height * 0.15), 12, 16),
                maxWidth: Math.round(keySize.width * 0.36),
            },
            channelValueFontSize: clamp(Math.round(keySize.height * 0.25), 22, 28),
            channelUnitFontSize: clamp(Math.round(keySize.height * 0.14), 12, 16),
            channelIconScale: 0.46,
            channelBarHeight: clamp(Math.round(keySize.height * 0.08), 7, 9),
        };
    }

    return {
        mode,
        padding,
        title: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.21),
            fontSize: clamp(Math.round(keySize.height * 0.125), 15, 18),
            maxWidth: contentWidth,
        },
        singleValue: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.445),
            fontSize: clamp(Math.round(keySize.height * 0.236), 28, 34),
            unitFontSize: clamp(Math.round(keySize.height * 0.125), 15, 18),
            maxWidth: contentWidth,
        },
        singleBar: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.632),
            width: contentWidth,
            height: config.barHeight,
            radius: config.borderRadius,
        },
        singleSecondaryText: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.847),
            fontSize: clamp(Math.round(keySize.height * 0.11), 13, 16),
            maxWidth: contentWidth,
        },
        channelValueFontSize: clamp(Math.round(keySize.height * 0.208), 24, 30),
        channelUnitFontSize: clamp(Math.round(keySize.height * 0.118), 14, 17),
        channelIconScale: 0.54,
        channelBarHeight: 9,
    };
}

function renderSingleBar(
    data: WidgetData,
    config: ProgressBarConfig,
    keySize: KeySize,
    layoutPlan: ProgressBarLayoutPlan,
): string {
    const fillWidth = Math.max(0, layoutPlan.singleBar.width * clamp(data.progress, 0, 1));
    const barColor = resolveColorForThresholdValue(data.current, config.colorConfig);
    const barHeadColor = adjustHexColorBrightness(barColor, config.gradientHeadAdjustmentPercent ?? -15);
    const gradientId = `progress-bar-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;
    const fillPaint = config.colorConfig.isGradientEnabled ? `url(#${gradientId})` : barColor;
    const valueText = data.barDisplayValue ?? data.displayValue ?? data.current.toFixed(0);
    const unitText = data.barUnit ?? data.unit;
    const titleText = data.barLabel ?? data.label;

    return `
        ${config.colorConfig.isGradientEnabled ? `<defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${barColor}" />
                <stop offset="100%" stop-color="${barHeadColor}" />
            </linearGradient>
        </defs>` : ""}
        ${renderTitle({
            iconFragment: config.topIconFragment,
            titleText,
            layout: layoutPlan.title,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
            clipId: "progress-bar-single-title",
            textColor: config.paints.secondaryText,
            iconColor: config.paints.icon,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
        })}
        ${renderValueWithUnit({
            clipId: "progress-bar-single-value",
            valueText,
            unitText,
            layout: layoutPlan.singleValue,
            valueTextColor: config.paints.primaryText,
            unitTextColor: config.paints.supportingText,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
        })}
        ${renderTrack(layoutPlan.singleBar, config.paints.track, config.themeEffects.subtleFilter)}
        ${renderFill(layoutPlan.singleBar, fillWidth, fillPaint, config.themeEffects.metricFilter)}
        ${renderSecondaryText({
            text: data.secondaryDisplayValue,
            layout: layoutPlan.singleSecondaryText,
            clipId: "progress-bar-single-secondary",
            textColor: config.paints.mutedText,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
        })}
    `;
}

function renderChannelBars(
    data: WidgetData,
    config: ProgressBarConfig,
    keySize: KeySize,
    layoutPlan: ProgressBarLayoutPlan,
): string {
    const titleText = data.barLabel ?? data.label;
    const channels = data.barChannels ?? [];

    return `
        ${renderTitle({
            iconFragment: config.topIconFragment,
            titleText,
            layout: layoutPlan.title,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
            clipId: "progress-bar-channel-title",
            textColor: config.paints.secondaryText,
            iconColor: config.paints.icon,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
        })}
        ${channels.slice(0, 2).map((channel, channelIndex) => {
            const channelLayout = buildChannelLayout({
                channelIndex,
                keySize,
                layoutPlan,
            });
            const fillWidth = Math.max(0, channelLayout.bar.width * clamp(channel.progress, 0, 1));
            const gradientId = `progress-bar-channel-${channelIndex}-${Math.round(channel.progress * 1000)}-${keySize.width}-${keySize.height}`;
            const headColor = adjustHexColorBrightness(channel.color, config.gradientHeadAdjustmentPercent ?? -15);
            const fillPaint = config.colorConfig.isGradientEnabled ? `url(#${gradientId})` : channel.color;

            return `
                ${config.colorConfig.isGradientEnabled ? `<defs>
                    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${channel.color}" />
                        <stop offset="100%" stop-color="${headColor}" />
                    </linearGradient>
                </defs>` : ""}
                <g color="${channel.color}" transform="translate(${channelLayout.iconCenterXCoordinate} ${channelLayout.iconCenterYCoordinate}) scale(${layoutPlan.channelIconScale})" ${buildSvgFilterAttributes(config.themeEffects.iconFilter).join(" ")}>
                    ${channel.iconFragment}
                </g>
                ${renderValueWithUnit({
                    clipId: `progress-bar-channel-${channelIndex}-value`,
                    valueText: channel.displayValue,
                    unitText: channel.unit,
                    layout: channelLayout.value,
                    valueTextColor: config.paints.primaryText,
                    unitTextColor: config.paints.supportingText,
                    textStyles: config.textStyles,
                    themeEffects: config.themeEffects,
                })}
                ${renderTrack(channelLayout.bar, config.paints.track, config.themeEffects.subtleFilter)}
                ${renderFill(channelLayout.bar, fillWidth, fillPaint, config.themeEffects.metricFilter)}
            `;
        }).join("")}
    `;
}

function buildChannelLayout(options: {
    channelIndex: number;
    keySize: KeySize;
    layoutPlan: ProgressBarLayoutPlan;
}): ChannelLayout {
    if (options.layoutPlan.mode === "wide") {
        const columnWidth = (options.keySize.width - options.layoutPlan.padding * 2 - 10) / 2;
        const columnXCoordinate = options.layoutPlan.padding + options.channelIndex * (columnWidth + 10);
        const valueYCoordinate = Math.round(options.keySize.height * 0.58);
        const barHeight = options.layoutPlan.channelBarHeight;

        return {
            value: {
                xCoordinate: columnXCoordinate + 26,
                yCoordinate: valueYCoordinate,
                fontSize: options.layoutPlan.channelValueFontSize,
                unitFontSize: options.layoutPlan.channelUnitFontSize,
                maxWidth: columnWidth - 26,
            },
            bar: {
                xCoordinate: columnXCoordinate,
                yCoordinate: Math.round(options.keySize.height * 0.78),
                width: columnWidth,
                height: barHeight,
                radius: barHeight / 2,
            },
            iconCenterXCoordinate: columnXCoordinate + 9,
            iconCenterYCoordinate: valueYCoordinate,
        };
    }

    const valueYCoordinate = options.channelIndex === 0
        ? Math.round(options.keySize.height * 0.424)
        : Math.round(options.keySize.height * 0.757);
    const barYCoordinate = options.channelIndex === 0
        ? Math.round(options.keySize.height * 0.535)
        : Math.round(options.keySize.height * 0.868);
    const barHeight = options.layoutPlan.channelBarHeight;

    return {
        value: {
            xCoordinate: options.layoutPlan.padding + 31,
            yCoordinate: valueYCoordinate,
            fontSize: options.layoutPlan.channelValueFontSize,
            unitFontSize: options.layoutPlan.channelUnitFontSize,
            maxWidth: options.keySize.width - options.layoutPlan.padding * 2 - 31,
        },
        bar: {
            xCoordinate: options.layoutPlan.padding,
            yCoordinate: barYCoordinate,
            width: options.keySize.width - options.layoutPlan.padding * 2,
            height: barHeight,
            radius: barHeight / 2,
        },
        iconCenterXCoordinate: options.layoutPlan.padding + 9,
        iconCenterYCoordinate: valueYCoordinate,
    };
}

function renderTitle(options: {
    iconFragment: string | undefined;
    titleText: string;
    layout: TextLineLayout;
    iconScale: number;
    iconGap: number;
    clipId: string;
    textColor: string;
    iconColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
}): string {
    const titleTextStyle = options.textStyles.title;
    const titleXCoordinate = options.iconFragment
        ? options.layout.xCoordinate + options.iconGap
        : options.layout.xCoordinate;
    const titleMaxWidth = Math.max(1, options.layout.maxWidth - (titleXCoordinate - options.layout.xCoordinate));
    const iconSvg = options.iconFragment
        ? `<g color="${options.iconColor}" transform="translate(${options.layout.xCoordinate + 10} ${options.layout.yCoordinate - 1}) scale(${options.iconScale})" ${buildSvgFilterAttributes(options.themeEffects.iconFilter).join(" ")}>${options.iconFragment}</g>`
        : "";

    return `
        ${iconSvg}
        ${renderStyledSvgText({
            id: options.clipId,
            text: options.titleText,
            xCoordinate: titleXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: titleMaxWidth,
            baseFontSize: options.layout.fontSize,
            textStyle: titleTextStyle,
            fill: options.textColor,
            extraAttributes: buildSvgFilterAttributes(titleTextStyle.filter),
        })}
    `;
}

function renderValueWithUnit(options: {
    clipId: string;
    valueText: string;
    unitText: string;
    layout: ValueLineLayout;
    valueTextColor: string;
    unitTextColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
}): string {
    const valueTextStyle = options.textStyles.value;
    const unitTextStyle = options.textStyles.unit;

    return renderMetricTextRow({
        id: options.clipId,
        layout: {
            xCoordinate: options.layout.xCoordinate,
            yCoordinate: options.layout.yCoordinate,
            width: options.layout.maxWidth,
        },
        value: {
            text: options.valueText,
            baseFontSize: options.layout.fontSize,
            textStyle: valueTextStyle,
            fill: options.valueTextColor,
            extraAttributes: [
                "font-variant-numeric=\"tabular-nums\"",
                ...buildSvgFilterAttributes(valueTextStyle.filter),
            ],
        },
        unit: {
            text: options.unitText,
            baseFontSize: options.layout.unitFontSize,
            textStyle: unitTextStyle,
            fill: options.unitTextColor,
            baselineOffset: 2,
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
        },
    });
}

function renderSecondaryText(options: {
    text: string | undefined;
    layout: TextLineLayout;
    clipId: string;
    textColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
}): string {
    if (!options.text) {
        return "";
    }
    const textStyle = options.textStyles.smallLabel;

    return renderStyledSvgText({
        id: options.clipId,
        text: options.text,
        xCoordinate: options.layout.xCoordinate,
        yCoordinate: options.layout.yCoordinate,
        maxWidth: options.layout.maxWidth,
        baseFontSize: options.layout.fontSize,
        textStyle,
        fill: options.textColor,
        extraAttributes: buildSvgFilterAttributes(textStyle.filter),
    });
}

function renderTrack(layout: BarLayout, color: string, filter: string | undefined): string {
    return `
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${layout.width}" height="${layout.height}"
            rx="${layout.radius}" fill="${color}" ${buildSvgFilterAttributes(filter).join(" ")} />
    `;
}

function renderFill(layout: BarLayout, fillWidth: number, fillPaint: string, filter: string | undefined): string {
    return `
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${fillWidth}" height="${layout.height}"
            rx="${layout.radius}" fill="${fillPaint}" ${buildSvgFilterAttributes(filter).join(" ")} />
    `;
}

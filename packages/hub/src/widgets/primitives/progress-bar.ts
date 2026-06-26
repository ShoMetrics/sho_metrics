import type { WidgetData, KeySize } from "../../view-rendering/widget-data";
import {
    DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
    type RenderOutlineTokens,
} from "../../view-rendering/render-appearance";
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
    escapeSvgText,
    isSvgOutlineEnabled,
    renderStyledSvgText,
    resolveSvgFilledShapeOutlinePadding,
} from "../../view-rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget-contract";
import { renderMetricTextRow } from "./metric-text-row";

export interface ProgressBarConfig extends WidgetBaseConfig {
    barHeight: number;
    borderRadius: number;
    paints: ProgressBarPaints;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    textOutline?: RenderOutlineTokens;
    shapeOutline?: RenderOutlineTokens;
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
    textOutline: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS.textOutline,
    shapeOutline: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS.shapeOutline,
    gradientHeadAdjustmentPercent: -15,
};

type ProgressBarLayoutMode = "square" | "wide";
const WIDE_BAR_INLINE_ICON_MAX_TITLE_CHARACTERS = 4;

interface ProgressBarLayoutPlan {
    mode: ProgressBarLayoutMode;
    padding: number;
    channelTitle: TextLineLayout;
    singleTitle: TextLineLayout;
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
    dominantBaseline?: "middle" | "auto";
}

type ProgressBarTitleIconPlacement = "inline" | "above";

interface ValueLineLayout extends TextLineLayout {
    unitFontSize: number;
    textAnchor?: "start" | "middle" | "end";
    unitXCoordinate?: number;
    unitMaxWidth?: number;
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
        const channelTitleLayout = {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.24),
            fontSize: clamp(Math.round(keySize.height * 0.18), 14, 18),
            maxWidth: contentWidth,
        };

        return {
            mode,
            padding,
            channelTitle: channelTitleLayout,
            singleTitle: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.53),
                fontSize: clamp(Math.round(keySize.height * 0.14), 13, 15),
                maxWidth: Math.round(keySize.width * 0.34),
                dominantBaseline: "auto",
            },
            singleValue: {
                xCoordinate: Math.round(keySize.width * 0.77),
                yCoordinate: Math.round(keySize.height * 0.53),
                fontSize: clamp(Math.round(keySize.height * 0.42), 34, 44),
                unitFontSize: clamp(Math.round(keySize.height * 0.17), 14, 18),
                maxWidth: Math.round(keySize.width * 0.36),
                textAnchor: "end",
                unitXCoordinate: Math.round(keySize.width * 0.80),
                unitMaxWidth: keySize.width - Math.round(keySize.width * 0.80) - padding,
                dominantBaseline: "auto",
            },
            singleBar: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.60),
                width: contentWidth,
                height: barHeight,
                radius: barHeight / 2,
            },
            singleSecondaryText: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.85),
                fontSize: clamp(Math.round(keySize.height * 0.15), 12, 16),
                maxWidth: contentWidth,
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
        channelTitle: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.21),
            fontSize: clamp(Math.round(keySize.height * 0.125), 15, 18),
            maxWidth: contentWidth,
        },
        singleTitle: {
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
    // On wide single bars, the optional value icon becomes the title-leading
    // icon. Rendering it again beside the value would collide with the fixed
    // value/unit columns.
    const usesWideSingleLeadingIcon = layoutPlan.mode === "wide" && data.barValueIconFragment !== undefined;
    const valueLayout = data.barValueIconFragment && !usesWideSingleLeadingIcon
        ? buildSingleValueLayoutWithIcon(layoutPlan.singleValue, layoutPlan)
        : layoutPlan.singleValue;
    const singleTitleIconFragment = usesWideSingleLeadingIcon
        ? data.barValueIconFragment
        : config.topIconFragment;
    const shouldStackTitleIcon = layoutPlan.mode === "wide"
        && [...titleText].length > WIDE_BAR_INLINE_ICON_MAX_TITLE_CHARACTERS;
    const titleIconPlacement: ProgressBarTitleIconPlacement = shouldStackTitleIcon
        ? "above"
        : "inline";

    return `
        ${config.colorConfig.isGradientEnabled ? `<defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${barColor}" />
                <stop offset="100%" stop-color="${barHeadColor}" />
            </linearGradient>
        </defs>` : ""}
        ${renderTitle({
            iconFragment: singleTitleIconFragment,
            titleText,
            layout: layoutPlan.singleTitle,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
            iconPlacement: titleIconPlacement,
            clipId: "progress-bar-single-title",
            textColor: config.paints.secondaryText,
            iconColor: config.paints.icon,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
            textOutline: config.textOutline,
        })}
        ${data.barValueIconFragment && !usesWideSingleLeadingIcon ? renderSingleValueIcon({
            iconFragment: data.barValueIconFragment,
            iconColor: data.barValueIconColor ?? barColor,
            yCoordinate: layoutPlan.singleValue.yCoordinate,
            layoutPlan,
            themeEffects: config.themeEffects,
        }) : ""}
        ${layoutPlan.mode === "wide" ? renderWideValueWithFixedUnit({
            clipId: "progress-bar-single",
            valueText,
            unitText,
            layout: valueLayout,
            valueTextColor: config.paints.primaryText,
            unitTextColor: config.paints.supportingText,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
            textOutline: config.textOutline,
        }) : renderValueWithUnit({
            clipId: "progress-bar-single-value",
            valueText,
            unitText,
            layout: valueLayout,
            valueTextColor: config.paints.primaryText,
            unitTextColor: config.paints.supportingText,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
            textOutline: config.textOutline,
        })}
        ${renderTrack(layoutPlan.singleBar, config.paints.track, config.themeEffects.subtleFilter, config.shapeOutline)}
        ${renderFill(layoutPlan.singleBar, fillWidth, fillPaint, config.themeEffects.metricFilter, config.shapeOutline)}
        ${renderSecondaryText({
            text: data.secondaryDisplayValue,
            layout: layoutPlan.singleSecondaryText,
            clipId: "progress-bar-single-secondary",
            textColor: config.paints.mutedText,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
            textOutline: config.textOutline,
        })}
    `;
}

function buildSingleValueLayoutWithIcon(
    valueLayout: ValueLineLayout,
    layoutPlan: ProgressBarLayoutPlan,
): ValueLineLayout {
    // Match the existing channel-row icon/value spacing so single-channel
    // throughput bars align with the two-channel bar layout.
    const iconOffset = layoutPlan.mode === "wide" ? 26 : 31;

    return {
        ...valueLayout,
        xCoordinate: valueLayout.xCoordinate + iconOffset,
        maxWidth: Math.max(1, valueLayout.maxWidth - iconOffset),
    };
}

function renderSingleValueIcon(options: {
    iconFragment: string;
    iconColor: string;
    yCoordinate: number;
    layoutPlan: ProgressBarLayoutPlan;
    themeEffects: RenderThemeEffectTokens;
}): string {
    // Match the existing channel-row icon placement for square and wide bars.
    const iconCenterXCoordinate = options.layoutPlan.padding + 9;
    const iconScale = options.layoutPlan.mode === "wide" ? 0.46 : 0.54;

    return `<g color="${options.iconColor}" transform="translate(${iconCenterXCoordinate} ${options.yCoordinate}) scale(${iconScale})" ${buildSvgFilterAttributes(options.themeEffects.iconFilter).join(" ")}>
        ${options.iconFragment}
    </g>`;
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
            layout: layoutPlan.channelTitle,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
            iconPlacement: "inline",
            clipId: "progress-bar-channel-title",
            textColor: config.paints.secondaryText,
            iconColor: config.paints.icon,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
            textOutline: config.textOutline,
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
                    textOutline: config.textOutline,
                })}
                ${renderTrack(channelLayout.bar, config.paints.track, config.themeEffects.subtleFilter, config.shapeOutline)}
                ${renderFill(channelLayout.bar, fillWidth, fillPaint, config.themeEffects.metricFilter, config.shapeOutline)}
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
    iconPlacement: ProgressBarTitleIconPlacement;
    clipId: string;
    textColor: string;
    iconColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    textOutline: RenderOutlineTokens | undefined;
}): string {
    const titleTextStyle = options.textStyles.title;
    const isInlineIcon = options.iconFragment !== undefined && options.iconPlacement === "inline";
    const titleXCoordinate = isInlineIcon
        ? options.layout.xCoordinate + options.iconGap
        : options.layout.xCoordinate;
    const titleMaxWidth = Math.max(1, options.layout.maxWidth - (titleXCoordinate - options.layout.xCoordinate));
    const iconSize = 24 * options.iconScale;
    const inlineIconYCoordinate = options.layout.dominantBaseline === "auto"
        ? options.layout.yCoordinate - iconSize + 1
        : options.layout.yCoordinate - 1;
    const aboveIconYCoordinate = options.layout.dominantBaseline === "auto"
        ? options.layout.yCoordinate - iconSize * 2.85
        : options.layout.yCoordinate - iconSize - 1;
    const iconYCoordinate = options.iconPlacement === "above"
        ? aboveIconYCoordinate
        : inlineIconYCoordinate;
    const iconSvg = options.iconFragment
        ? `<g color="${options.iconColor}" transform="translate(${options.layout.xCoordinate + 10} ${iconYCoordinate}) scale(${options.iconScale})" ${buildSvgFilterAttributes(options.themeEffects.iconFilter).join(" ")}>${options.iconFragment}</g>`
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
            dominantBaseline: options.layout.dominantBaseline,
            outline: options.textOutline,
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
    textOutline: RenderOutlineTokens | undefined;
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
        outline: options.textOutline,
    });
}

function renderWideValueWithFixedUnit(options: {
    clipId: string;
    valueText: string;
    unitText: string;
    layout: ValueLineLayout;
    valueTextColor: string;
    unitTextColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    textOutline: RenderOutlineTokens | undefined;
}): string {
    const valueTextStyle = options.textStyles.value;
    const unitTextStyle = options.textStyles.unit;
    const valueText = renderStyledSvgText({
        id: `${options.clipId}-value`,
        text: options.valueText,
        xCoordinate: options.layout.xCoordinate,
        yCoordinate: options.layout.yCoordinate,
        maxWidth: options.layout.maxWidth,
        baseFontSize: options.layout.fontSize,
        textStyle: valueTextStyle,
        fill: options.valueTextColor,
        textAnchor: options.layout.textAnchor ?? "end",
        dominantBaseline: options.layout.dominantBaseline,
        outline: options.textOutline,
        extraAttributes: [
            "font-variant-numeric=\"tabular-nums\"",
            ...buildSvgFilterAttributes(valueTextStyle.filter),
        ],
        fitOptions: { minimumFontScale: 0.44, widthGuardRatio: 1.08 },
    });

    if (options.unitText.length === 0) {
        return valueText;
    }

    return `
        ${valueText}
        ${renderStyledSvgText({
            id: `${options.clipId}-unit`,
            text: options.unitText,
            xCoordinate: options.layout.unitXCoordinate ?? options.layout.xCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: options.layout.unitMaxWidth ?? options.layout.maxWidth,
            baseFontSize: options.layout.unitFontSize,
            textStyle: unitTextStyle,
            fill: options.unitTextColor,
            textAnchor: "start",
            dominantBaseline: options.layout.dominantBaseline,
            outline: options.textOutline,
            extraAttributes: buildSvgFilterAttributes(unitTextStyle.filter),
            fitOptions: { minimumFontScale: 0.50, widthGuardRatio: 1.8 },
        })}
    `;
}

function renderSecondaryText(options: {
    text: string | undefined;
    layout: TextLineLayout;
    clipId: string;
    textColor: string;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    textOutline: RenderOutlineTokens | undefined;
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
        outline: options.textOutline,
        extraAttributes: buildSvgFilterAttributes(textStyle.filter),
    });
}

function renderTrack(
    layout: BarLayout,
    color: string,
    filter: string | undefined,
    outline: RenderOutlineTokens | undefined,
): string {
    return `
        ${renderFilledRectOutline({
            className: "progress-bar-track-outline",
            layout,
            width: layout.width,
            outline,
        })}
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${layout.width}" height="${layout.height}"
            rx="${layout.radius}" fill="${color}" ${buildSvgFilterAttributes(filter).join(" ")} />
    `;
}

function renderFill(
    layout: BarLayout,
    fillWidth: number,
    fillPaint: string,
    filter: string | undefined,
    outline: RenderOutlineTokens | undefined,
): string {
    return `
        ${renderFilledRectOutline({
            className: "progress-bar-fill-outline",
            layout,
            width: fillWidth,
            outline,
        })}
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${fillWidth}" height="${layout.height}"
            rx="${layout.radius}" fill="${fillPaint}" ${buildSvgFilterAttributes(filter).join(" ")} />
    `;
}

function renderFilledRectOutline(options: {
    className: string;
    layout: BarLayout;
    width: number;
    outline: RenderOutlineTokens | undefined;
}): string {
    if (!isSvgOutlineEnabled(options.outline) || options.width <= 0 || options.layout.height <= 0) {
        return "";
    }

    // Bars are filled rectangles, not stroked shapes. Draw a larger black
    // rounded rect behind the foreground so the visible interior stays crisp.
    const padding = resolveSvgFilledShapeOutlinePadding(options.layout.height, options.outline);

    return `<rect class="${options.className}"
        x="${formatSvgNumber(options.layout.xCoordinate - padding)}"
        y="${formatSvgNumber(options.layout.yCoordinate - padding)}"
        width="${formatSvgNumber(options.width + padding * 2)}"
        height="${formatSvgNumber(options.layout.height + padding * 2)}"
        rx="${formatSvgNumber(options.layout.radius + padding)}"
        fill="${escapeSvgText(options.outline.color)}" opacity="${formatSvgNumber(options.outline.strength)}" />`;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}

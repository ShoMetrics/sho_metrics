import type { WidgetData, KeySize } from "../../rendering/widget-data";
import { resolveColor } from "../../rendering/color-resolver";
import { adjustHexColorBrightness, clamp, escapeSvgText } from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";

export interface LinearBarConfig extends WidgetBaseConfig {
    trackColor: string;
    barHeight: number;
    borderRadius: number;
    topIconFragment?: string;
}

export const DEFAULT_LINEAR_BAR_CONFIG: LinearBarConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ]},
    trackColor: "rgba(255,255,255,0.08)",
    barHeight: 14,
    borderRadius: 7,
    gradientHeadAdjustmentPercent: -15,
};

type LinearLayoutMode = "square" | "wide";

interface LinearLayoutPlan {
    mode: LinearLayoutMode;
    padding: number;
    title: TextLineLayout;
    singleValue: ValueLineLayout;
    singleBar: BarLayout;
    singleSecondary: TextLineLayout;
    channelValueFontSize: number;
    channelUnitFontSize: number;
    channelIconScale: number;
    channelBarHeight: number;
}

interface TextLineLayout {
    xCoordinate: number;
    yCoordinate: number;
    fontSize: number;
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
 * Linear progress bar. Full width = 100%.
 * Renders compact hardware and network layouts for square keys and wide touch strips.
 */
export const linearBar: Widget<LinearBarConfig> = {
    widgetId: "linear-bar",

    render(data: WidgetData, config: LinearBarConfig, keySize: KeySize): string {
        const layoutPlan = buildLinearLayoutPlan(keySize, config);

        if (data.linearChannels && data.linearChannels.length > 0) {
            return renderChannelBars(data, config, keySize, layoutPlan);
        }

        return renderSingleBar(data, config, keySize, layoutPlan);
    },
};

function buildLinearLayoutPlan(keySize: KeySize, config: LinearBarConfig): LinearLayoutPlan {
    const aspectRatio = keySize.width / keySize.height;
    const mode: LinearLayoutMode = aspectRatio >= 1.45 ? "wide" : "square";
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
            },
            singleValue: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.62),
                fontSize: clamp(Math.round(keySize.height * 0.32), 26, 34),
                unitFontSize: clamp(Math.round(keySize.height * 0.17), 14, 18),
            },
            singleBar: {
                xCoordinate: Math.round(keySize.width * 0.54),
                yCoordinate: Math.round(keySize.height * 0.66),
                width: Math.round(keySize.width * 0.36),
                height: barHeight,
                radius: barHeight / 2,
            },
            singleSecondary: {
                xCoordinate: Math.round(keySize.width * 0.54),
                yCoordinate: Math.round(keySize.height * 0.43),
                fontSize: clamp(Math.round(keySize.height * 0.15), 12, 16),
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
        },
        singleValue: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.445),
            fontSize: clamp(Math.round(keySize.height * 0.236), 28, 34),
            unitFontSize: clamp(Math.round(keySize.height * 0.125), 15, 18),
        },
        singleBar: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.632),
            width: contentWidth,
            height: config.barHeight,
            radius: config.borderRadius,
        },
        singleSecondary: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.847),
            fontSize: clamp(Math.round(keySize.height * 0.11), 13, 16),
        },
        channelValueFontSize: clamp(Math.round(keySize.height * 0.208), 24, 30),
        channelUnitFontSize: clamp(Math.round(keySize.height * 0.118), 14, 17),
        channelIconScale: 0.54,
        channelBarHeight: 9,
    };
}

function renderSingleBar(
    data: WidgetData,
    config: LinearBarConfig,
    keySize: KeySize,
    layoutPlan: LinearLayoutPlan,
): string {
    const fillWidth = Math.max(0, layoutPlan.singleBar.width * clamp(data.progress, 0, 1));
    const barColor = resolveColor(data.current, config.colorConfig);
    const barHeadColor = adjustHexColorBrightness(barColor, config.gradientHeadAdjustmentPercent ?? -15);
    const gradientId = `linear-progress-${Math.round(data.current * 10)}-${keySize.width}-${keySize.height}`;
    const valueText = data.linearDisplayValue ?? data.displayValue ?? data.current.toFixed(0);
    const unitText = data.linearUnit ?? data.unit;
    const titleText = data.linearLabel ?? data.label;

    return `
        <defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${barColor}" />
                <stop offset="100%" stop-color="${barHeadColor}" />
            </linearGradient>
        </defs>
        ${renderTitle({
            iconFragment: config.topIconFragment,
            titleText,
            layout: layoutPlan.title,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
        })}
        ${renderValueWithUnit({
            valueText,
            unitText: formatLinearUnit(unitText),
            layout: layoutPlan.singleValue,
        })}
        ${renderTrack(layoutPlan.singleBar, config.trackColor)}
        ${renderFill(layoutPlan.singleBar, fillWidth, gradientId)}
        ${renderSecondaryText({
            text: data.secondaryDisplayValue,
            layout: layoutPlan.singleSecondary,
        })}
    `;
}

function renderChannelBars(
    data: WidgetData,
    config: LinearBarConfig,
    keySize: KeySize,
    layoutPlan: LinearLayoutPlan,
): string {
    const titleText = data.linearLabel ?? data.label;
    const channels = data.linearChannels ?? [];

    return `
        ${renderTitle({
            iconFragment: config.topIconFragment,
            titleText,
            layout: layoutPlan.title,
            iconScale: layoutPlan.mode === "wide" ? 0.3 : 0.34,
            iconGap: layoutPlan.mode === "wide" ? 25 : 27,
        })}
        ${channels.slice(0, 2).map((channel, channelIndex) => {
            const channelLayout = buildChannelLayout({
                channelIndex,
                keySize,
                layoutPlan,
            });
            const fillWidth = Math.max(0, channelLayout.bar.width * clamp(channel.progress, 0, 1));
            const gradientId = `linear-channel-${channelIndex}-${Math.round(channel.progress * 1000)}-${keySize.width}-${keySize.height}`;
            const headColor = adjustHexColorBrightness(channel.color, config.gradientHeadAdjustmentPercent ?? -15);

            return `
                <defs>
                    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${channel.color}" />
                        <stop offset="100%" stop-color="${headColor}" />
                    </linearGradient>
                </defs>
                <g transform="translate(${channelLayout.iconCenterXCoordinate} ${channelLayout.iconCenterYCoordinate}) scale(${layoutPlan.channelIconScale})">
                    ${channel.iconFragment}
                </g>
                ${renderValueWithUnit({
                    valueText: channel.displayValue,
                    unitText: channel.unit,
                    layout: channelLayout.value,
                })}
                ${renderTrack(channelLayout.bar, config.trackColor)}
                ${renderFill(channelLayout.bar, fillWidth, gradientId)}
            `;
        }).join("")}
    `;
}

function buildChannelLayout(options: {
    channelIndex: number;
    keySize: KeySize;
    layoutPlan: LinearLayoutPlan;
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
}): string {
    const titleXCoordinate = options.iconFragment
        ? options.layout.xCoordinate + options.iconGap
        : options.layout.xCoordinate;
    const iconSvg = options.iconFragment
        ? `<g transform="translate(${options.layout.xCoordinate + 10} ${options.layout.yCoordinate - 1}) scale(${options.iconScale})">${options.iconFragment}</g>`
        : "";

    return `
        ${iconSvg}
        <text x="${titleXCoordinate}" y="${options.layout.yCoordinate}" text-anchor="start"
            dominant-baseline="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.layout.fontSize}" font-weight="850" fill="rgba(255,255,255,0.88)">${escapeSvgText(options.titleText)}</text>
    `;
}

function renderValueWithUnit(options: {
    valueText: string;
    unitText: string;
    layout: ValueLineLayout;
}): string {
    const valueWidth = estimateTextWidth(options.valueText, options.layout.fontSize, 0.56);

    return `
        <text x="${options.layout.xCoordinate}" y="${options.layout.yCoordinate}" text-anchor="start"
            dominant-baseline="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-variant-numeric="tabular-nums"
            font-size="${options.layout.fontSize}" font-weight="900" fill="white">${escapeSvgText(options.valueText)}</text>
        <text x="${options.layout.xCoordinate + valueWidth + 4}" y="${options.layout.yCoordinate + 2}" text-anchor="start"
            dominant-baseline="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.layout.unitFontSize}" font-weight="800" fill="rgba(255,255,255,0.76)">${escapeSvgText(options.unitText)}</text>
    `;
}

function renderSecondaryText(options: {
    text: string | undefined;
    layout: TextLineLayout;
}): string {
    if (!options.text) {
        return "";
    }

    return `
        <text x="${options.layout.xCoordinate}" y="${options.layout.yCoordinate}" text-anchor="start"
            dominant-baseline="middle"
            font-family="'Inter','SF Pro Display','Segoe UI',sans-serif"
            font-size="${options.layout.fontSize}" font-weight="750" fill="rgba(255,255,255,0.78)">${escapeSvgText(options.text)}</text>
    `;
}

function renderTrack(layout: BarLayout, color: string): string {
    return `
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${layout.width}" height="${layout.height}"
            rx="${layout.radius}" fill="${color}" />
    `;
}

function renderFill(layout: BarLayout, fillWidth: number, gradientId: string): string {
    return `
        <rect x="${layout.xCoordinate}" y="${layout.yCoordinate}" width="${fillWidth}" height="${layout.height}"
            rx="${layout.radius}" fill="url(#${gradientId})" />
    `;
}

function formatLinearUnit(unit: string): string {
    if (unit === "C" || unit === "F") {
        return `°${unit}`;
    }

    return unit;
}

function estimateTextWidth(text: string, fontSize: number, averageCharacterWidthRatio: number): number {
    return text.length * fontSize * averageCharacterWidthRatio;
}

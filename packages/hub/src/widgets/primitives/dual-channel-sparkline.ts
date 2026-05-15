import type { DualChannelWidgetData, KeySize, SparklineScale } from "../../rendering/widget-data";
import { adjustHexColorBrightness, clamp, renderConstrainedSvgText } from "../../rendering/svg-utils";
import type { WidgetBaseConfig } from "../widget.interface";
import { renderMetricTextRow } from "./metric-text-row";
import {
    buildDualSparklineChannelModels,
    type DualSparklineChannelInput,
    type DualSparklineChartLayout,
    type DualSparklinePoint,
} from "./dual-channel-sparkline-chart";
import {
    resolveSparklineGridLineOpacity,
    type SparklineGridLineType,
    type SparklineGridLineVisibility,
} from "./sparkline-grid-lines";

export interface DualChannelSparklineConfig extends WidgetBaseConfig {
    chartMode: DualChannelSparklineMode;
    positiveColor: string;
    negativeColor: string;
    titleText?: string;
    topIconFragment?: string;
    positiveIconFragment?: string;
    negativeIconFragment?: string;
    lineWidth: number;
    fillOpacity: number;
    lineSmoothingPercent: number;
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
    sparklineScale?: SparklineScale;
    titleTextColor: string;
    valueTextColor: string;
    unitTextColor: string;
    iconColor: string;
    horizontalGuideLineColor: string;
    timeGuideLineColor: string;
    baselineColor: string;
}

export type DualChannelSparklineMode = "overlay" | "mirrored";

export const DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG: DualChannelSparklineConfig = {
    colorConfig: { mode: "solid", solidColor: "#3b82f6", thresholds: [], isGradientEnabled: true },
    chartMode: "overlay",
    positiveColor: "#3b82f6",
    negativeColor: "#ef4444",
    titleText: "",
    lineWidth: 2,
    fillOpacity: 0.46,
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
    timeGuideTickCount: 5,
    historyWindowSeconds: 60,
    sparklineScale: { mode: "adaptive", minimumValue: 0 },
    titleTextColor: "rgba(255,255,255,0.88)",
    valueTextColor: "rgba(255,255,255,0.96)",
    unitTextColor: "rgba(255,255,255,0.76)",
    iconColor: "rgba(255,255,255,0.88)",
    horizontalGuideLineColor: "rgba(255,255,255,1)",
    timeGuideLineColor: "rgba(255,255,255,0.24)",
    baselineColor: "rgba(255,255,255,0.24)",
};

const DUAL_SPARKLINE_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";
const CHART_PLOT_TOP_INSET = 2;

interface DualSparklineLayoutPlan {
    title: DualSparklineTitleLayout;
    firstRow: DualSparklineRowLayout;
    secondRow: DualSparklineRowLayout;
    chart: DualSparklineChartLayout;
    titleIconScale: number;
    titleIconGap: number;
}

interface DualSparklineTitleLayout {
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    fontSize: number;
}

interface DualSparklineRowLayout {
    iconXCoordinate: number;
    iconYCoordinate: number;
    iconScale: number;
    valueXCoordinate: number;
    valueYCoordinate: number;
    valueWidth: number;
    valueFontSize: number;
    unitFontSize: number;
}

/**
 * Renders two traffic channels in one sparkline. Overlay mode keeps both
 * channels above the baseline; mirrored mode uses one upper and one lower
 * half while preserving the same smoothing and scale behavior.
 */
export function renderDualChannelSparkline(
    data: DualChannelWidgetData,
    config: DualChannelSparklineConfig,
    keySize: KeySize,
): string {
    const layoutPlan = buildDualSparklineLayoutPlan(keySize);
    const chartLayout = resolveChartLayout({
        chartLayout: layoutPlan.chart,
        chartMode: config.chartMode,
        keySize,
    });
    const gradientIdSuffix = [
        keySize.width,
        keySize.height,
        Math.round(data.positive.current * 10),
        Math.round(data.negative.current * 10),
        data.positive.history.length,
        data.negative.history.length,
    ].join("-");
    const positiveLineGradientId = `dual-sparkline-positive-line-${gradientIdSuffix}`;
    const positiveAreaGradientId = `dual-sparkline-positive-area-${gradientIdSuffix}`;
    const negativeLineGradientId = `dual-sparkline-negative-line-${gradientIdSuffix}`;
    const negativeAreaGradientId = `dual-sparkline-negative-area-${gradientIdSuffix}`;
    const glowFilterId = `dual-sparkline-glow-${keySize.width}-${keySize.height}`;
    const plotLayout = buildPlotLayout(chartLayout);
    const channelInputs = buildChannelInputs({
        positiveValues: data.positive.history,
        negativeValues: data.negative.history,
        plotLayout,
        chartMode: config.chartMode,
    });
    const channelModels = buildDualSparklineChannelModels({
        channels: channelInputs,
        plotLayout,
        sparklineScale: config.sparklineScale ?? data.positive.sparklineScale ?? data.negative.sparklineScale,
        lineSmoothingPercent: config.lineSmoothingPercent,
    });
    const positiveModel = channelModels.find(channel => channel.channelId === "positive");
    const negativeModel = channelModels.find(channel => channel.channelId === "negative");
    const gridLineSvg = config.chartMode === "mirrored"
        ? ""
        : renderGridLines({
            plotLayout,
            points: channelModels.flatMap(channel => channel.points),
            gridLineVisibility: config.gridLineVisibility,
            gridLineType: config.gridLineType,
            timeGuideTickCount: config.timeGuideTickCount,
            horizontalGuideLineColor: config.horizontalGuideLineColor,
            timeGuideLineColor: config.timeGuideLineColor,
            baselineColor: config.baselineColor,
        });

    return `
        <defs>
            ${config.colorConfig.isGradientEnabled ? `
                ${renderLineGradient(positiveLineGradientId, config.positiveColor)}
                ${renderAreaGradient(positiveAreaGradientId, config.positiveColor, config.fillOpacity)}
                ${renderLineGradient(negativeLineGradientId, config.negativeColor)}
                ${renderAreaGradient(negativeAreaGradientId, config.negativeColor, config.fillOpacity * 0.82)}
            ` : ""}
            <filter id="${glowFilterId}" x="-10%" y="-30%" width="120%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blurredLine" />
                <feColorMatrix in="blurredLine" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.48 0" />
            </filter>
        </defs>
        ${renderTitle({
            iconFragment: config.topIconFragment,
            titleText: resolveTitleText(data, config),
            layout: layoutPlan.title,
            iconScale: layoutPlan.titleIconScale,
            iconGap: layoutPlan.titleIconGap,
            textColor: config.titleTextColor,
            iconColor: config.iconColor,
        })}
        ${renderChannelRow({
            layout: resolveRowLayout(layoutPlan, chartLayout, config.chartMode, "positive"),
            iconFragment: config.positiveIconFragment,
            color: config.positiveColor,
            valueText: data.positive.displayValue ?? data.positive.current.toFixed(1),
            unitText: data.positive.unit,
            rowId: "dual-sparkline-positive-row",
            showIcon: config.chartMode !== "mirrored",
            valueTextColor: config.valueTextColor,
            unitTextColor: config.unitTextColor,
        })}
        ${renderChannelRow({
            layout: resolveRowLayout(layoutPlan, chartLayout, config.chartMode, "negative"),
            iconFragment: config.negativeIconFragment,
            color: config.negativeColor,
            valueText: data.negative.displayValue ?? data.negative.current.toFixed(1),
            unitText: data.negative.unit,
            rowId: "dual-sparkline-negative-row",
            showIcon: config.chartMode !== "mirrored",
            valueTextColor: config.valueTextColor,
            unitTextColor: config.unitTextColor,
        })}
        ${gridLineSvg}
        ${config.chartMode === "mirrored" ? renderMirroredBaseline(plotLayout, config.baselineColor) : ""}
        ${renderChannelPathGroup({
            model: positiveModel,
            linePaint: config.colorConfig.isGradientEnabled ? `url(#${positiveLineGradientId})` : config.positiveColor,
            areaPaint: config.colorConfig.isGradientEnabled ? `url(#${positiveAreaGradientId})` : config.positiveColor,
            areaOpacity: config.colorConfig.isGradientEnabled ? undefined : config.fillOpacity,
            lineWidth: config.lineWidth,
            glowFilterId,
        })}
        ${renderChannelPathGroup({
            model: negativeModel,
            linePaint: config.colorConfig.isGradientEnabled ? `url(#${negativeLineGradientId})` : config.negativeColor,
            areaPaint: config.colorConfig.isGradientEnabled ? `url(#${negativeAreaGradientId})` : config.negativeColor,
            areaOpacity: config.colorConfig.isGradientEnabled ? undefined : config.fillOpacity * 0.82,
            lineWidth: config.lineWidth,
            glowFilterId,
        })}
    `;
}

function buildChannelInputs(options: {
    positiveValues: readonly number[];
    negativeValues: readonly number[];
    plotLayout: DualSparklineChartLayout;
    chartMode: DualChannelSparklineMode;
}): readonly DualSparklineChannelInput[] {
    if (options.chartMode !== "mirrored") {
        return [
            {
                channelId: "positive",
                values: options.positiveValues,
                orientation: "positive",
            },
            {
                channelId: "negative",
                values: options.negativeValues,
                orientation: "positive",
            },
        ];
    }

    const halfHeight = Math.max(1, options.plotLayout.height / 2);

    return [
        {
            channelId: "positive",
            values: options.positiveValues,
            orientation: "positive",
            plotLayout: {
                ...options.plotLayout,
                height: halfHeight,
            },
        },
        {
            channelId: "negative",
            values: options.negativeValues,
            orientation: "negative",
            plotLayout: {
                ...options.plotLayout,
                yCoordinate: options.plotLayout.yCoordinate + halfHeight,
                height: halfHeight,
            },
        },
    ];
}

function resolveRowLayout(
    layoutPlan: DualSparklineLayoutPlan,
    chartLayout: DualSparklineChartLayout,
    chartMode: DualChannelSparklineMode,
    channelId: "positive" | "negative",
): DualSparklineRowLayout {
    if (chartMode !== "mirrored") {
        return channelId === "positive" ? layoutPlan.firstRow : layoutPlan.secondRow;
    }

    return channelId === "positive"
        ? buildMirroredUpperRowLayout(chartLayout)
        : buildMirroredLowerRowLayout(chartLayout);
}

function resolveChartLayout(options: {
    chartLayout: DualSparklineChartLayout;
    chartMode: DualChannelSparklineMode;
    keySize: KeySize;
}): DualSparklineChartLayout {
    if (options.chartMode !== "mirrored") {
        return options.chartLayout;
    }

    const aspectRatio = options.keySize.width / options.keySize.height;
    const isWide = aspectRatio >= 1.45;
    const minimumSize = Math.min(options.keySize.width, options.keySize.height);
    const padding = Math.round(minimumSize * (isWide ? 0.08 : 0.105));
    const yCoordinate = Math.round(options.keySize.height * (isWide ? 0.34 : 0.30));
    const bottomInset = Math.round(options.keySize.height * (isWide ? 0.10 : 0.09));

    return {
        ...options.chartLayout,
        xCoordinate: padding,
        width: options.keySize.width - padding * 2,
        yCoordinate,
        height: Math.max(1, options.keySize.height - yCoordinate - bottomInset),
    };
}

function buildDualSparklineLayoutPlan(keySize: KeySize): DualSparklineLayoutPlan {
    const aspectRatio = keySize.width / keySize.height;
    const isWide = aspectRatio >= 1.45;
    const minimumSize = Math.min(keySize.width, keySize.height);
    const padding = Math.round(minimumSize * (isWide ? 0.08 : 0.105));
    const contentWidth = keySize.width - padding * 2;

    if (isWide) {
        const chartXCoordinate = Math.round(keySize.width * 0.42);
        const rowValueXCoordinate = padding + 22;
        const rowValueWidth = Math.max(28, chartXCoordinate - rowValueXCoordinate - 7);

        return {
            title: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.22),
                maxWidth: contentWidth,
                fontSize: clamp(Math.round(keySize.height * 0.155), 13, 16),
            },
            firstRow: buildRowLayout({
                iconXCoordinate: padding + 6,
                iconYCoordinate: Math.round(keySize.height * 0.48),
                valueXCoordinate: rowValueXCoordinate,
                valueWidth: rowValueWidth,
                valueFontSize: clamp(Math.round(keySize.height * 0.15), 13, 17),
                unitFontSize: clamp(Math.round(keySize.height * 0.105), 10, 12),
                iconScale: 0.28,
            }),
            secondRow: buildRowLayout({
                iconXCoordinate: padding + 6,
                iconYCoordinate: Math.round(keySize.height * 0.70),
                valueXCoordinate: rowValueXCoordinate,
                valueWidth: rowValueWidth,
                valueFontSize: clamp(Math.round(keySize.height * 0.15), 13, 17),
                unitFontSize: clamp(Math.round(keySize.height * 0.105), 10, 12),
                iconScale: 0.28,
            }),
            chart: {
                xCoordinate: chartXCoordinate,
                yCoordinate: Math.round(keySize.height * 0.38),
                width: keySize.width - chartXCoordinate - padding,
                height: Math.round(keySize.height * 0.47),
            },
            titleIconScale: 0.36,
            titleIconGap: 28,
        };
    }

    return {
        title: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.18),
            maxWidth: contentWidth,
            fontSize: clamp(Math.round(keySize.height * 0.12), 14, 17),
        },
        firstRow: buildRowLayout({
            iconXCoordinate: padding + 4,
            iconYCoordinate: Math.round(keySize.height * 0.34),
            valueXCoordinate: padding + 24,
            valueWidth: contentWidth - 22,
            valueFontSize: clamp(Math.round(keySize.height * 0.162), 21, 26),
            unitFontSize: clamp(Math.round(keySize.height * 0.095), 13, 15),
            iconScale: 0.36,
        }),
        secondRow: buildRowLayout({
            iconXCoordinate: padding + 4,
            iconYCoordinate: Math.round(keySize.height * 0.515),
            valueXCoordinate: padding + 24,
            valueWidth: contentWidth - 22,
            valueFontSize: clamp(Math.round(keySize.height * 0.162), 21, 26),
            unitFontSize: clamp(Math.round(keySize.height * 0.095), 13, 15),
            iconScale: 0.36,
        }),
        chart: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.62),
            width: contentWidth,
            height: Math.round(keySize.height * 0.29),
        },
        titleIconScale: 0.39,
        titleIconGap: 31,
    };
}

function buildMirroredUpperRowLayout(chartLayout: DualSparklineChartLayout): DualSparklineRowLayout {
    return buildRowLayout({
        iconXCoordinate: chartLayout.xCoordinate,
        iconYCoordinate: chartLayout.yCoordinate + chartLayout.height * 0.22,
        valueXCoordinate: chartLayout.xCoordinate + 3,
        valueWidth: chartLayout.width - 6,
        valueFontSize: clamp(Math.round(chartLayout.height * 0.29), 18, 25),
        unitFontSize: clamp(Math.round(chartLayout.height * 0.17), 11, 15),
        iconScale: 0,
    });
}

function buildMirroredLowerRowLayout(chartLayout: DualSparklineChartLayout): DualSparklineRowLayout {
    return buildRowLayout({
        iconXCoordinate: chartLayout.xCoordinate,
        iconYCoordinate: chartLayout.yCoordinate + chartLayout.height * 0.86,
        valueXCoordinate: chartLayout.xCoordinate + 3,
        valueWidth: chartLayout.width - 6,
        valueFontSize: clamp(Math.round(chartLayout.height * 0.29), 18, 25),
        unitFontSize: clamp(Math.round(chartLayout.height * 0.17), 11, 15),
        iconScale: 0,
    });
}

function renderTitle(options: {
    iconFragment: string | undefined;
    titleText: string;
    layout: DualSparklineTitleLayout;
    iconScale: number;
    iconGap: number;
    textColor: string;
    iconColor: string;
}): string {
    const titleXCoordinate = options.iconFragment
        ? options.layout.xCoordinate + options.iconGap
        : options.layout.xCoordinate;
    const titleMaxWidth = Math.max(1, options.layout.maxWidth - (titleXCoordinate - options.layout.xCoordinate));
    const iconSvg = options.iconFragment
        ? `<g color="${options.iconColor}" transform="translate(${options.layout.xCoordinate + 9} ${options.layout.yCoordinate - 1}) scale(${options.iconScale})">${options.iconFragment}</g>`
        : "";

    return `
        ${iconSvg}
        ${renderConstrainedSvgText({
            id: "dual-sparkline-title",
            text: options.titleText,
            xCoordinate: titleXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: titleMaxWidth,
            fontSize: options.layout.fontSize,
            fontFamily: DUAL_SPARKLINE_FONT_FAMILY,
            fontWeight: 850,
            fill: options.textColor,
        })}
    `;
}

function resolveTitleText(data: DualChannelWidgetData, config: DualChannelSparklineConfig): string {
    if (config.titleText && config.titleText.trim().length > 0) {
        return config.titleText;
    }

    return data.positive.label;
}

function buildRowLayout(options: {
    iconXCoordinate: number;
    iconYCoordinate: number;
    valueXCoordinate: number;
    valueWidth: number;
    valueFontSize: number;
    unitFontSize: number;
    iconScale: number;
}): DualSparklineRowLayout {
    return {
        ...options,
        valueYCoordinate: options.iconYCoordinate,
    };
}

function buildPlotLayout(chartLayout: DualSparklineChartLayout): DualSparklineChartLayout {
    return {
        xCoordinate: chartLayout.xCoordinate,
        yCoordinate: chartLayout.yCoordinate + CHART_PLOT_TOP_INSET,
        width: chartLayout.width,
        height: Math.max(1, chartLayout.height - CHART_PLOT_TOP_INSET),
    };
}

function renderChannelRow(options: {
    layout: DualSparklineRowLayout;
    iconFragment: string | undefined;
    color: string;
    valueText: string;
    unitText: string;
    rowId: string;
    showIcon: boolean;
    valueTextColor: string;
    unitTextColor: string;
}): string {
    const iconSvg = !options.showIcon
        ? ""
        : options.iconFragment
        ? `<g color="${options.color}" transform="translate(${formatSvgNumber(options.layout.iconXCoordinate)} ${formatSvgNumber(options.layout.iconYCoordinate)}) scale(${formatSvgNumber(options.layout.iconScale)})">${options.iconFragment}</g>`
        : `<circle cx="${formatSvgNumber(options.layout.iconXCoordinate)}" cy="${formatSvgNumber(options.layout.iconYCoordinate)}" r="4" fill="${options.color}" />`;

    return `
        ${iconSvg}
        ${renderMetricTextRow({
            id: options.rowId,
            valueText: options.valueText,
            unitText: options.unitText,
            xCoordinate: options.layout.valueXCoordinate,
            yCoordinate: options.layout.valueYCoordinate,
            width: options.layout.valueWidth,
            valueFontSize: options.layout.valueFontSize,
            unitFontSize: options.layout.unitFontSize,
            fontFamily: DUAL_SPARKLINE_FONT_FAMILY,
            valueFontWeight: 900,
            unitFontWeight: 780,
            valueFill: options.valueTextColor,
            unitFill: options.unitTextColor,
            unitBaselineOffset: 2,
            valueExtraAttributes: ["font-variant-numeric=\"tabular-nums\""],
        })}
    `;
}

function renderChannelPathGroup(options: {
    model: { linePath: string; areaPath: string } | undefined;
    linePaint: string;
    areaPaint: string;
    areaOpacity: number | undefined;
    lineWidth: number;
    glowFilterId: string;
}): string {
    if (!options.model) {
        return "";
    }

    const areaOpacity = options.areaOpacity === undefined
        ? ""
        : ` opacity="${formatSvgNumber(options.areaOpacity)}"`;

    return `
        <path d="${options.model.areaPath}" fill="${options.areaPaint}"${areaOpacity} />
        <path d="${options.model.linePath}" fill="none" stroke="${options.linePaint}"
            stroke-width="${Math.max(1, options.lineWidth + 1.2)}" stroke-linejoin="round"
            stroke-linecap="round" filter="url(#${options.glowFilterId})" opacity="0.46" />
        <path d="${options.model.linePath}" fill="none" stroke="${options.linePaint}"
            stroke-width="${options.lineWidth}" stroke-linejoin="round" stroke-linecap="round" />
    `;
}

function renderGridLines(options: {
    plotLayout: DualSparklineChartLayout;
    points: readonly DualSparklinePoint[];
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    timeGuideTickCount: number;
    horizontalGuideLineColor: string;
    timeGuideLineColor: string;
    baselineColor: string;
}): string {
    if (options.gridLineVisibility === "none") {
        return "";
    }

    const gridLineMetrics = resolveSparklineGridLineOpacity({
        gridLineVisibility: options.gridLineVisibility,
        gridLineType: options.gridLineType,
        points: options.points,
        plotLayout: options.plotLayout,
    });

    if (!gridLineMetrics) {
        return "";
    }

    if (options.gridLineType === "vertical") {
        return renderVerticalGuides({
            plotLayout: options.plotLayout,
            opacity: gridLineMetrics.opacity,
            timeGuideTickCount: options.timeGuideTickCount,
            timeGuideLineColor: options.timeGuideLineColor,
            baselineColor: options.baselineColor,
        });
    }

    return renderHorizontalGuides({
        plotLayout: options.plotLayout,
        opacity: gridLineMetrics.opacity,
        horizontalGuideLineColor: options.horizontalGuideLineColor,
    });
}

function renderHorizontalGuides(options: {
    plotLayout: DualSparklineChartLayout;
    opacity: number;
    horizontalGuideLineColor: string;
}): string {
    const guideList = [1, 0.5, 0].map(progress => {
        const yCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height * (1 - progress);

        return `
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(yCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(yCoordinate)}"
                stroke="${options.horizontalGuideLineColor}" stroke-opacity="${formatSvgNumber(options.opacity)}" stroke-width="1"
                stroke-dasharray="4 4" stroke-linecap="round" />
        `;
    });

    return `<g>${guideList.join("")}</g>`;
}

function renderVerticalGuides(options: {
    plotLayout: DualSparklineChartLayout;
    opacity: number;
    timeGuideTickCount: number;
    timeGuideLineColor: string;
    baselineColor: string;
}): string {
    const safeTickCount = Math.max(2, Math.round(options.timeGuideTickCount));
    const baselineYCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height;
    const internalGuideList = Array.from({ length: Math.max(0, safeTickCount - 2) }, (_ignoredValue, guideIndex) => {
        const tickIndex = guideIndex + 1;
        const xCoordinate = options.plotLayout.xCoordinate + (options.plotLayout.width * tickIndex) / (safeTickCount - 1);

        return `
            <line x1="${formatSvgNumber(xCoordinate)}" y1="${formatSvgNumber(options.plotLayout.yCoordinate)}"
                x2="${formatSvgNumber(xCoordinate)}" y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${options.timeGuideLineColor}" stroke-width="1.1" stroke-linecap="round" />
        `;
    });

    return `
        <g opacity="${formatSvgNumber(options.opacity)}">
            ${internalGuideList.join("")}
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${options.baselineColor}" stroke-width="1" stroke-dasharray="4 4" stroke-linecap="round" />
        </g>
    `;
}

function renderMirroredBaseline(plotLayout: DualSparklineChartLayout, baselineColor: string): string {
    const baselineYCoordinate = plotLayout.yCoordinate + plotLayout.height / 2;

    return `
        <line x1="${formatSvgNumber(plotLayout.xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
            x2="${formatSvgNumber(plotLayout.xCoordinate + plotLayout.width)}"
            y2="${formatSvgNumber(baselineYCoordinate)}"
            stroke="${baselineColor}" stroke-width="1.15" stroke-linecap="round" />
    `;
}

function renderLineGradient(gradientId: string, color: string): string {
    return `
        <linearGradient id="${gradientId}" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${adjustHexColorBrightness(color, -18)}" />
            <stop offset="72%" stop-color="${color}" />
            <stop offset="100%" stop-color="${adjustHexColorBrightness(color, 28)}" />
        </linearGradient>
    `;
}

function renderAreaGradient(gradientId: string, color: string, fillOpacity: number): string {
    return `
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${adjustHexColorBrightness(color, 28)}" stop-opacity="${formatSvgNumber(fillOpacity)}" />
            <stop offset="58%" stop-color="${color}" stop-opacity="${formatSvgNumber(fillOpacity * 0.34)}" />
            <stop offset="100%" stop-color="${color}" stop-opacity="${formatSvgNumber(fillOpacity * 0.10)}" />
        </linearGradient>
    `;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}

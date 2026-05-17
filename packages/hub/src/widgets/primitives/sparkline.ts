import type { WidgetData, KeySize, SparklineScale } from "../../view-rendering/widget-data";
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
    adjustHexColorBrightness,
    clamp,
    renderConstrainedSvgText,
    type SvgTextAnchor,
} from "../../view-rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget-contract";
import { renderMetricTextRow } from "./metric-text-row";
import {
    resolveSparklineGridLineOpacity,
    type SparklineGridLineType,
    type SparklineGridLineVisibility,
} from "./sparkline-grid-lines";
import { buildSparklineAreaPath, buildSparklineLinePath } from "./sparkline-path";
import { smoothSparklineValues } from "./sparkline-smoothing";

export type { SparklineGridLineType, SparklineGridLineVisibility } from "./sparkline-grid-lines";

export interface SparklineConfig extends WidgetBaseConfig {
    lineWidth: number;
    fillOpacity: number;
    lineSmoothingPercent: number;
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
    showDots: boolean;
    dashPattern: string;
    paints: SparklinePaints;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
    topIconFragment?: string;
}

export interface SparklinePaints {
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly supportingText: string;
    readonly mutedText: string;
    readonly icon: string;
    readonly surface: string;
    readonly divider: string;
    readonly grid: string;
    readonly baseline: string;
}

export const DEFAULT_SPARKLINE_CONFIG: SparklineConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ], isGradientEnabled: true },
    lineWidth: 2,
    fillOpacity: 0.58,
    lineSmoothingPercent: 75,
    gridLineVisibility: "adaptive",
    gridLineType: "horizontal",
    timeGuideTickCount: 5,
    historyWindowSeconds: 60,
    showDots: false,
    dashPattern: "",
    paints: {
        primaryText: "rgba(255,255,255,0.96)",
        secondaryText: "rgba(255,255,255,0.88)",
        supportingText: "rgba(255,255,255,0.75)",
        mutedText: "rgba(255,255,255,0.34)",
        icon: "rgba(255,255,255,0.88)",
        surface: "rgba(255,255,255,0.07)",
        divider: "rgba(255,255,255,0.05)",
        grid: "rgba(255,255,255,1)",
        baseline: "rgba(255,255,255,0.30)",
    },
    textStyles: DEFAULT_RENDER_TEXT_STYLES,
    themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    gradientHeadAdjustmentPercent: 28,
};

const MINIMUM_VISIBLE_RANGE = 1;
const MINIMUM_AREA_PROGRESS = 0.09;
const ADAPTIVE_SCALE_HEADROOM_RATIO = 1.18;
const CHART_PLOT_TOP_INSET = 2;
const CHART_PANEL_RADIUS = 7;
const CHART_LABEL_BAND_HEIGHT = 14;
const CHART_PLOT_SIDE_INSET = 1;
const TIME_GUIDE_LINE_WIDTH = 1.15;
const TIME_GUIDE_TICK_HEIGHT = 5;

interface SparklineLayoutPlan {
    title: TextLineLayout;
    value: ValueLineLayout;
    chart: ChartLayout;
    iconScale: number;
    iconGap: number;
}

interface TextLineLayout {
    xCoordinate: number;
    yCoordinate: number;
    maxWidth: number;
    fontSize: number;
}

interface ValueLineLayout extends TextLineLayout {
    unitFontSize: number;
    textAnchor?: SvgTextAnchor;
}

interface ChartLayout {
    xCoordinate: number;
    yCoordinate: number;
    width: number;
    height: number;
}

interface SparklinePoint {
    xCoordinate: number;
    yCoordinate: number;
}

/**
 * Sparkline chart showing the current value and a smooth filled one-minute trend.
 */
export const sparkline: Widget<SparklineConfig> = {
    widgetId: "sparkline",

    render(data: WidgetData, config: SparklineConfig, keySize: KeySize): string {
        const layoutPlan = buildSparklineLayoutPlan(keySize);
        const rawValues = buildRenderableValues(data);
        const visualValues = smoothSparklineValues(rawValues, config.lineSmoothingPercent);
        const currentColor = resolveColorForThresholdValue(data.current, config.colorConfig);
        const lineHeadColor = config.colorConfig.isGradientEnabled
            ? adjustHexColorBrightness(currentColor, config.gradientHeadAdjustmentPercent ?? 28)
            : currentColor;
        const lineTailColor = config.colorConfig.isGradientEnabled
            ? adjustHexColorBrightness(currentColor, -18)
            : currentColor;
        const gradientIdSuffix = `${keySize.width}-${keySize.height}-${Math.round(data.current * 10)}-${rawValues.length}`;
        const lineGradientId = `sparkline-line-${gradientIdSuffix}`;
        const areaGradientId = `sparkline-area-${gradientIdSuffix}`;
        const glowFilterId = `sparkline-glow-${keySize.width}-${keySize.height}`;
        const latestPointGlowFilterId = `sparkline-latest-glow-${keySize.width}-${keySize.height}`;
        const plotLayout = buildPlotLayout(layoutPlan.chart, config.gridLineVisibility, config.gridLineType);
        const points = buildSparklinePoints(visualValues, plotLayout, data.sparklineScale);
        const linePath = buildSparklineLinePath({
            points,
            lineSmoothingPercent: config.lineSmoothingPercent,
        });
        const areaPath = buildSparklineAreaPath({
            points,
            baselineYCoordinate: plotLayout.yCoordinate + plotLayout.height,
            lineSmoothingPercent: config.lineSmoothingPercent,
        });
        const gridLineSvg = renderGridLines({
            chartLayout: layoutPlan.chart,
            plotLayout,
            points,
            gridLineVisibility: config.gridLineVisibility,
            gridLineType: config.gridLineType,
            timeGuideTickCount: config.timeGuideTickCount,
            historyWindowSeconds: config.historyWindowSeconds,
            paints: config.paints,
            textStyles: config.textStyles,
            themeEffects: config.themeEffects,
        });
        const latestPoint = points[points.length - 1];
        const latestPointGlowSvg = config.gridLineVisibility !== "none" && config.gridLineType === "vertical" && latestPoint
            ? renderLatestPointGlow(latestPoint, lineHeadColor, latestPointGlowFilterId)
            : "";
        const valueText = data.displayValue ?? data.current.toFixed(1);
        const dotSvg = config.showDots && latestPoint
            ? `<circle cx="${formatSvgNumber(latestPoint.xCoordinate)}" cy="${formatSvgNumber(latestPoint.yCoordinate)}" r="2.8" fill="${lineHeadColor}" />`
            : "";
        const linePaint = config.colorConfig.isGradientEnabled ? `url(#${lineGradientId})` : currentColor;
        const areaPaint = config.colorConfig.isGradientEnabled ? `url(#${areaGradientId})` : currentColor;
        const areaOpacity = config.colorConfig.isGradientEnabled ? "" : ` opacity="${config.fillOpacity}"`;

        return `
            <defs>
                ${config.colorConfig.isGradientEnabled ? `<linearGradient id="${lineGradientId}" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="${lineTailColor}" />
                    <stop offset="72%" stop-color="${currentColor}" />
                    <stop offset="100%" stop-color="${lineHeadColor}" />
                </linearGradient>
                <linearGradient id="${areaGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="${lineHeadColor}" stop-opacity="${config.fillOpacity}" />
                    <stop offset="48%" stop-color="${currentColor}" stop-opacity="${config.fillOpacity * 0.48}" />
                    <stop offset="100%" stop-color="${currentColor}" stop-opacity="${config.fillOpacity * 0.14}" />
                </linearGradient>` : ""}
                <filter id="${glowFilterId}" x="-10%" y="-30%" width="120%" height="160%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.7" result="blurredLine" />
                    <feColorMatrix in="blurredLine" type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0" />
                </filter>
                <filter id="${latestPointGlowFilterId}" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3.1" />
                </filter>
            </defs>
            ${renderTitle({
                iconFragment: config.topIconFragment,
                titleText: data.label,
                layout: layoutPlan.title,
                iconScale: layoutPlan.iconScale,
                iconGap: layoutPlan.iconGap,
                textColor: config.paints.secondaryText,
                iconColor: config.paints.icon,
                textStyles: config.textStyles,
                themeEffects: config.themeEffects,
            })}
            ${renderMetricTextRow({
                id: "sparkline-current-value",
                layout: {
                    xCoordinate: layoutPlan.value.xCoordinate,
                    yCoordinate: layoutPlan.value.yCoordinate,
                    width: layoutPlan.value.maxWidth,
                    textAnchor: layoutPlan.value.textAnchor,
                },
                value: {
                    text: valueText,
                    fontSize: resolveRenderTextStyleFontSize(layoutPlan.value.fontSize, config.textStyles.value),
                    fontFamily: config.textStyles.value.fontFamily,
                    fontWeight: config.textStyles.value.fontWeight,
                    fill: config.paints.primaryText,
                    extraAttributes: [
                        "font-variant-numeric=\"tabular-nums\"",
                        ...buildSvgFilterAttributes(config.textStyles.value.filter),
                    ],
                },
                unit: {
                    text: data.unit,
                    fontSize: resolveRenderTextStyleFontSize(layoutPlan.value.unitFontSize, config.textStyles.unit),
                    fontFamily: config.textStyles.unit.fontFamily,
                    fontWeight: config.textStyles.unit.fontWeight,
                    fill: config.paints.supportingText,
                    baselineOffset: 2,
                    extraAttributes: buildSvgFilterAttributes(config.textStyles.unit.filter),
                },
            })}
            <path d="${areaPath}" fill="${areaPaint}"${areaOpacity} ${buildSvgFilterAttributes(config.themeEffects.subtleFilter).join(" ")} />
            ${gridLineSvg}
            ${latestPointGlowSvg}
            <path d="${linePath}" fill="none" stroke="${linePaint}"
                stroke-width="${Math.max(1, config.lineWidth + 1.4)}" stroke-linejoin="round"
                stroke-linecap="round" filter="url(#${glowFilterId})" opacity="0.55" />
            <path d="${linePath}" fill="none" stroke="${linePaint}"
                stroke-width="${config.lineWidth}" stroke-linejoin="round" stroke-linecap="round"
                stroke-dasharray="${config.dashPattern}" ${buildSvgFilterAttributes(config.themeEffects.metricFilter).join(" ")} />
            ${dotSvg}
        `;
    },
};

function buildSparklineLayoutPlan(keySize: KeySize): SparklineLayoutPlan {
    const aspectRatio = keySize.width / keySize.height;
    const isWide = aspectRatio >= 1.45;
    const minimumSize = Math.min(keySize.width, keySize.height);
    const padding = Math.round(minimumSize * (isWide ? 0.1 : 0.105));
    const contentWidth = keySize.width - padding * 2;

    if (isWide) {
        return {
            title: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.22),
                maxWidth: Math.round(contentWidth * 0.52),
                fontSize: clamp(Math.round(keySize.height * 0.16), 13, 17),
            },
            value: {
                xCoordinate: keySize.width - padding,
                yCoordinate: Math.round(keySize.height * 0.24),
                maxWidth: Math.round(contentWidth * 0.42),
                fontSize: clamp(Math.round(keySize.height * 0.25), 22, 27),
                unitFontSize: clamp(Math.round(keySize.height * 0.13), 12, 15),
                textAnchor: "end",
            },
            chart: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.42),
                width: contentWidth,
                height: Math.round(keySize.height * 0.43),
            },
            iconScale: 0.28,
            iconGap: 23,
        };
    }

    return {
        title: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.18),
            maxWidth: contentWidth,
            fontSize: clamp(Math.round(keySize.height * 0.12), 14, 17),
        },
        value: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.43),
            maxWidth: contentWidth,
            fontSize: clamp(Math.round(keySize.height * 0.265), 32, 40),
            unitFontSize: clamp(Math.round(keySize.height * 0.14), 16, 20),
        },
        chart: {
            xCoordinate: padding,
            yCoordinate: Math.round(keySize.height * 0.56),
            width: contentWidth,
            height: Math.round(keySize.height * 0.34),
        },
        iconScale: 0.31,
        iconGap: 26,
    };
}

function renderTitle(options: {
    iconFragment: string | undefined;
    titleText: string;
    layout: TextLineLayout;
    iconScale: number;
    iconGap: number;
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
        ? `<g color="${options.iconColor}" transform="translate(${options.layout.xCoordinate + 9} ${options.layout.yCoordinate - 1}) scale(${options.iconScale})" ${buildSvgFilterAttributes(options.themeEffects.iconFilter).join(" ")}>${options.iconFragment}</g>`
        : "";

    return `
        ${iconSvg}
        ${renderConstrainedSvgText({
            id: "sparkline-title",
            text: options.titleText,
            xCoordinate: titleXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: titleMaxWidth,
            fontSize: resolveRenderTextStyleFontSize(options.layout.fontSize, titleTextStyle),
            fontFamily: titleTextStyle.fontFamily,
            fontWeight: titleTextStyle.fontWeight,
            fill: options.textColor,
            extraAttributes: buildSvgFilterAttributes(titleTextStyle.filter),
        })}
    `;
}

function buildRenderableValues(data: WidgetData): readonly number[] {
    const finiteHistoryValues = data.history.filter((value) => Number.isFinite(value));

    if (finiteHistoryValues.length === 1) {
        return [finiteHistoryValues[0], finiteHistoryValues[0]];
    }

    if (finiteHistoryValues.length > 0) {
        return finiteHistoryValues;
    }

    const fallbackValue = Number.isFinite(data.current) ? data.current : 0;

    return [fallbackValue, fallbackValue];
}

function buildSparklinePoints(
    values: readonly number[],
    chartLayout: ChartLayout,
    sparklineScale: SparklineScale | undefined,
): readonly SparklinePoint[] {
    const scaleBounds = resolveSparklineScaleBounds(values, sparklineScale);
    const valueRange = Math.max(scaleBounds.maximumValue - scaleBounds.minimumValue, MINIMUM_VISIBLE_RANGE);
    const pointCount = values.length;

    return values.map((value, valueIndex) => {
        const progress = pointCount > 1 ? valueIndex / (pointCount - 1) : 1;
        const normalizedValue = (value - scaleBounds.minimumValue) / valueRange;
        const visualProgress = MINIMUM_AREA_PROGRESS + clamp(normalizedValue, 0, 1) * (1 - MINIMUM_AREA_PROGRESS);

        return {
            xCoordinate: chartLayout.xCoordinate + progress * chartLayout.width,
            yCoordinate: chartLayout.yCoordinate + chartLayout.height - visualProgress * chartLayout.height,
        };
    });
}

function resolveSparklineScaleBounds(
    values: readonly number[],
    sparklineScale: SparklineScale | undefined,
): { minimumValue: number; maximumValue: number } {
    if (sparklineScale?.mode === "fixed") {
        const minimumValue = Number.isFinite(sparklineScale.minimumValue) ? sparklineScale.minimumValue : 0;
        const maximumValue = Number.isFinite(sparklineScale.maximumValue)
            ? sparklineScale.maximumValue
            : minimumValue + MINIMUM_VISIBLE_RANGE;

        return {
            minimumValue,
            maximumValue: Math.max(maximumValue, minimumValue + MINIMUM_VISIBLE_RANGE),
        };
    }

    const minimumValue = resolveAdaptiveMinimumValue(values, sparklineScale);
    const maximumHistoryValue = Math.max(...values, minimumValue + MINIMUM_VISIBLE_RANGE);
    const maximumValue = minimumValue >= 0
        ? maximumHistoryValue * ADAPTIVE_SCALE_HEADROOM_RATIO
        : maximumHistoryValue;

    return {
        minimumValue,
        maximumValue: Math.max(maximumValue, minimumValue + MINIMUM_VISIBLE_RANGE),
    };
}

function resolveAdaptiveMinimumValue(
    values: readonly number[],
    sparklineScale: SparklineScale | undefined,
): number {
    if (sparklineScale?.mode !== "adaptive") {
        return Math.min(...values, 0);
    }

    const candidateMinimumValue = sparklineScale.minimumValue;
    return typeof candidateMinimumValue === "number" && Number.isFinite(candidateMinimumValue)
        ? candidateMinimumValue
        : Math.min(...values, 0);
}

function buildPlotLayout(
    chartLayout: ChartLayout,
    gridLineVisibility: SparklineGridLineVisibility,
    gridLineType: SparklineGridLineType,
): ChartLayout {
    if (gridLineVisibility !== "none" && gridLineType === "vertical") {
        return {
            xCoordinate: chartLayout.xCoordinate + CHART_PLOT_SIDE_INSET,
            yCoordinate: chartLayout.yCoordinate + CHART_PLOT_TOP_INSET,
            width: Math.max(1, chartLayout.width - CHART_PLOT_SIDE_INSET * 2),
            height: Math.max(1, chartLayout.height - CHART_LABEL_BAND_HEIGHT - CHART_PLOT_TOP_INSET),
        };
    }

    return {
        xCoordinate: chartLayout.xCoordinate,
        yCoordinate: chartLayout.yCoordinate + CHART_PLOT_TOP_INSET,
        width: chartLayout.width,
        height: Math.max(1, chartLayout.height - CHART_PLOT_TOP_INSET),
    };
}

function renderGridLines(options: {
    chartLayout: ChartLayout;
    plotLayout: ChartLayout;
    points: readonly SparklinePoint[];
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
    paints: SparklinePaints;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
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
        return renderVerticalGridLines({
            chartLayout: options.chartLayout,
            plotLayout: options.plotLayout,
            timeGuideTickCount: options.timeGuideTickCount,
            historyWindowSeconds: options.historyWindowSeconds,
            opacity: gridLineMetrics.opacity,
            paints: options.paints,
            textStyles: options.textStyles,
            themeEffects: options.themeEffects,
        });
    }

    return renderHorizontalGuides({
        plotLayout: options.plotLayout,
        opacity: gridLineMetrics.opacity,
        gridColor: options.paints.grid,
        themeEffects: options.themeEffects,
    });
}

function renderHorizontalGuides(options: {
    plotLayout: ChartLayout;
    opacity: number;
    gridColor: string;
    themeEffects: RenderThemeEffectTokens;
}): string {
    const guideList = [1, 0.5, 0].map(progress => {
        const yCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height * (1 - progress);

        return `
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(yCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(yCoordinate)}"
                stroke="${options.gridColor}" stroke-opacity="${formatSvgNumber(options.opacity)}" stroke-width="1"
                stroke-dasharray="4 4" stroke-linecap="round" ${buildSvgFilterAttributes(options.themeEffects.subtleFilter).join(" ")} />
        `;
    });

    return `
        <g>
            ${guideList.join("")}
        </g>
    `;
}

function renderVerticalGridLines(options: {
    chartLayout: ChartLayout;
    plotLayout: ChartLayout;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
    opacity: number;
    paints: SparklinePaints;
    textStyles: RenderTextStyles;
    themeEffects: RenderThemeEffectTokens;
}): string {
    const smallLabelTextStyle = options.textStyles.smallLabel;
    const safeTickCount = Math.max(2, Math.round(options.timeGuideTickCount));
    const baselineYCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height;
    const internalGuideList = Array.from({ length: Math.max(0, safeTickCount - 2) }, (ignoredValue, guideIndex) => {
        const tickIndex = guideIndex + 1;
        const xCoordinate = options.plotLayout.xCoordinate + (options.plotLayout.width * tickIndex) / (safeTickCount - 1);
        const labelSeconds = Math.round(options.historyWindowSeconds * (1 - tickIndex / (safeTickCount - 1)));

        return `
            <line x1="${formatSvgNumber(xCoordinate)}" y1="${formatSvgNumber(options.plotLayout.yCoordinate)}"
                x2="${formatSvgNumber(xCoordinate)}" y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${options.paints.grid}" stroke-width="${TIME_GUIDE_LINE_WIDTH}"
                stroke-linecap="round" ${buildSvgFilterAttributes(options.themeEffects.subtleFilter).join(" ")} />
            <line x1="${formatSvgNumber(xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
                x2="${formatSvgNumber(xCoordinate)}" y2="${formatSvgNumber(baselineYCoordinate + TIME_GUIDE_TICK_HEIGHT)}"
                stroke="${options.paints.grid}" stroke-width="${TIME_GUIDE_LINE_WIDTH}"
                stroke-linecap="round" ${buildSvgFilterAttributes(options.themeEffects.subtleFilter).join(" ")} />
            ${renderConstrainedSvgText({
                id: `sparkline-time-${tickIndex}`,
                text: `${labelSeconds}s`,
                xCoordinate,
                yCoordinate: baselineYCoordinate + CHART_LABEL_BAND_HEIGHT - 2,
                maxWidth: 24,
                fontSize: resolveRenderTextStyleFontSize(10, smallLabelTextStyle),
                fontFamily: smallLabelTextStyle.fontFamily,
                fontWeight: smallLabelTextStyle.fontWeight,
                fill: options.paints.mutedText,
                textAnchor: "middle",
                extraAttributes: buildSvgFilterAttributes(smallLabelTextStyle.filter),
            })}
        `;
    });

    return `
        <g opacity="${formatSvgNumber(options.opacity)}">
            <rect x="${formatSvgNumber(options.chartLayout.xCoordinate)}" y="${formatSvgNumber(options.chartLayout.yCoordinate)}"
                width="${formatSvgNumber(options.chartLayout.width)}" height="${formatSvgNumber(options.chartLayout.height)}"
                rx="${CHART_PANEL_RADIUS}" fill="${options.paints.surface}" stroke="${options.paints.divider}" stroke-width="1" ${buildSvgFilterAttributes(options.themeEffects.subtleFilter).join(" ")} />
            ${internalGuideList.join("")}
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${options.paints.baseline}" stroke-width="1" stroke-dasharray="4 4" stroke-linecap="round" ${buildSvgFilterAttributes(options.themeEffects.subtleFilter).join(" ")} />
        </g>
    `;
}

function renderLatestPointGlow(point: SparklinePoint, color: string, filterId: string): string {
    return `
        <circle cx="${formatSvgNumber(point.xCoordinate)}" cy="${formatSvgNumber(point.yCoordinate)}"
            r="5.5" fill="${color}" opacity="0.34" filter="url(#${filterId})" />
    `;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}

import type { WidgetData, KeySize, SparklineScale } from "../../rendering/widget-data";
import { resolveColor } from "../../rendering/color-resolver";
import {
    adjustHexColorBrightness,
    clamp,
    renderConstrainedSvgText,
} from "../../rendering/svg-utils";
import type { Widget, WidgetBaseConfig } from "../widget.interface";
import { renderMetricTextRow } from "./metric-text-row";

export type SparklineChartGuideStyle = "horizontal" | "time-axis";

export interface SparklineConfig extends WidgetBaseConfig {
    lineWidth: number;
    fillOpacity: number;
    lineSmoothingPercent: number;
    chartGuideStyle: SparklineChartGuideStyle;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
    showDots: boolean;
    dashPattern: string;
    topIconFragment?: string;
}

export const DEFAULT_SPARKLINE_CONFIG: SparklineConfig = {
    colorConfig: { mode: "threshold", solidColor: "#3b82f6", thresholds: [
        { min: 0, max: 50, color: "#22c55e" },
        { min: 50, max: 80, color: "#eab308" },
        { min: 80, max: 101, color: "#ef4444" },
    ]},
    lineWidth: 2,
    fillOpacity: 0.58,
    lineSmoothingPercent: 75,
    chartGuideStyle: "horizontal",
    timeGuideTickCount: 5,
    historyWindowSeconds: 60,
    showDots: false,
    dashPattern: "",
    gradientHeadAdjustmentPercent: 28,
};

const SPARKLINE_TEXT_FONT_FAMILY = "'Inter','SF Pro Display','Segoe UI',sans-serif";
const MINIMUM_VISIBLE_RANGE = 1;
const MINIMUM_AREA_PROGRESS = 0.09;
const ADAPTIVE_SCALE_HEADROOM_RATIO = 1.18;
const CHART_PLOT_TOP_INSET = 2;
const HORIZONTAL_GUIDE_LINE_COLOR = "rgba(255,255,255,0.24)";
const CHART_PANEL_FILL = "rgba(255,255,255,0.07)";
const CHART_PANEL_STROKE = "rgba(255,255,255,0.05)";
const CHART_PANEL_RADIUS = 7;
const CHART_LABEL_BAND_HEIGHT = 14;
const CHART_PLOT_SIDE_INSET = 1;
const TIME_GUIDE_LINE_COLOR = "rgba(255,255,255,0.28)";
const TIME_GUIDE_LINE_WIDTH = 1.15;
const TIME_GUIDE_TICK_HEIGHT = 5;
const BASELINE_COLOR = "rgba(255,255,255,0.30)";
const TIME_LABEL_COLOR = "rgba(255,255,255,0.34)";

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
        const currentColor = resolveColor(data.current, config.colorConfig);
        const lineHeadColor = adjustHexColorBrightness(currentColor, config.gradientHeadAdjustmentPercent ?? 28);
        const lineTailColor = adjustHexColorBrightness(currentColor, -18);
        const gradientIdSuffix = `${keySize.width}-${keySize.height}-${Math.round(data.current * 10)}-${rawValues.length}`;
        const lineGradientId = `sparkline-line-${gradientIdSuffix}`;
        const areaGradientId = `sparkline-area-${gradientIdSuffix}`;
        const glowFilterId = `sparkline-glow-${keySize.width}-${keySize.height}`;
        const latestPointGlowFilterId = `sparkline-latest-glow-${keySize.width}-${keySize.height}`;
        const plotLayout = buildPlotLayout(layoutPlan.chart, config.chartGuideStyle);
        const points = buildSparklinePoints(visualValues, plotLayout, data.sparklineScale);
        const linePath = buildSmoothPath(points);
        const areaPath = buildAreaPath(points, plotLayout);
        const chartGuideSvg = renderChartGuides({
            chartLayout: layoutPlan.chart,
            plotLayout,
            guideStyle: config.chartGuideStyle,
            timeGuideTickCount: config.timeGuideTickCount,
            historyWindowSeconds: config.historyWindowSeconds,
        });
        const latestPoint = points[points.length - 1];
        const latestPointGlowSvg = config.chartGuideStyle === "time-axis" && latestPoint
            ? renderLatestPointGlow(latestPoint, lineHeadColor, latestPointGlowFilterId)
            : "";
        const valueText = data.displayValue ?? data.current.toFixed(1);
        const dotSvg = config.showDots && latestPoint
            ? `<circle cx="${formatSvgNumber(latestPoint.xCoordinate)}" cy="${formatSvgNumber(latestPoint.yCoordinate)}" r="2.8" fill="${lineHeadColor}" />`
            : "";

        return `
            <defs>
                <linearGradient id="${lineGradientId}" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="${lineTailColor}" />
                    <stop offset="72%" stop-color="${currentColor}" />
                    <stop offset="100%" stop-color="${lineHeadColor}" />
                </linearGradient>
                <linearGradient id="${areaGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="${lineHeadColor}" stop-opacity="${config.fillOpacity}" />
                    <stop offset="48%" stop-color="${currentColor}" stop-opacity="${config.fillOpacity * 0.48}" />
                    <stop offset="100%" stop-color="${currentColor}" stop-opacity="${config.fillOpacity * 0.14}" />
                </linearGradient>
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
            })}
            ${renderMetricTextRow({
                id: "sparkline-current-value",
                valueText,
                unitText: formatCurrentUnit(data.unit),
                xCoordinate: layoutPlan.value.xCoordinate,
                yCoordinate: layoutPlan.value.yCoordinate,
                width: layoutPlan.value.maxWidth,
                valueFontSize: layoutPlan.value.fontSize,
                unitFontSize: layoutPlan.value.unitFontSize,
                fontFamily: SPARKLINE_TEXT_FONT_FAMILY,
                valueFontWeight: 900,
                unitFontWeight: 780,
                valueFill: "rgba(255,255,255,0.96)",
                unitFill: "rgba(255,255,255,0.75)",
                unitBaselineOffset: 2,
                valueExtraAttributes: ["font-variant-numeric=\"tabular-nums\""],
            })}
            ${chartGuideSvg}
            <path d="${areaPath}" fill="url(#${areaGradientId})" />
            ${latestPointGlowSvg}
            <path d="${linePath}" fill="none" stroke="url(#${lineGradientId})"
                stroke-width="${Math.max(1, config.lineWidth + 1.4)}" stroke-linejoin="round"
                stroke-linecap="round" filter="url(#${glowFilterId})" opacity="0.55" />
            <path d="${linePath}" fill="none" stroke="url(#${lineGradientId})"
                stroke-width="${config.lineWidth}" stroke-linejoin="round" stroke-linecap="round"
                stroke-dasharray="${config.dashPattern}" />
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
                maxWidth: Math.round(contentWidth * 0.45),
                fontSize: clamp(Math.round(keySize.height * 0.16), 13, 17),
            },
            value: {
                xCoordinate: padding,
                yCoordinate: Math.round(keySize.height * 0.62),
                maxWidth: Math.round(contentWidth * 0.43),
                fontSize: clamp(Math.round(keySize.height * 0.31), 25, 33),
                unitFontSize: clamp(Math.round(keySize.height * 0.15), 13, 17),
            },
            chart: {
                xCoordinate: Math.round(keySize.width * 0.49),
                yCoordinate: Math.round(keySize.height * 0.2),
                width: Math.round(keySize.width * 0.41),
                height: Math.round(keySize.height * 0.72),
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
}): string {
    const titleXCoordinate = options.iconFragment
        ? options.layout.xCoordinate + options.iconGap
        : options.layout.xCoordinate;
    const titleMaxWidth = Math.max(1, options.layout.maxWidth - (titleXCoordinate - options.layout.xCoordinate));
    const iconSvg = options.iconFragment
        ? `<g transform="translate(${options.layout.xCoordinate + 9} ${options.layout.yCoordinate - 1}) scale(${options.iconScale})">${options.iconFragment}</g>`
        : "";

    return `
        ${iconSvg}
        ${renderConstrainedSvgText({
            id: "sparkline-title",
            text: options.titleText,
            xCoordinate: titleXCoordinate,
            yCoordinate: options.layout.yCoordinate,
            maxWidth: titleMaxWidth,
            fontSize: options.layout.fontSize,
            fontFamily: SPARKLINE_TEXT_FONT_FAMILY,
            fontWeight: 850,
            fill: "rgba(255,255,255,0.88)",
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

/**
 * Applies a weighted moving average to the visual series only. A higher
 * smoothing value favors a calm wave shape, while zero keeps the raw samples.
 */
function smoothSparklineValues(values: readonly number[], lineSmoothingPercent: number): readonly number[] {
    const smoothingRatio = clamp(lineSmoothingPercent, 0, 100) / 100;

    if (smoothingRatio <= 0 || values.length <= 2) {
        return values;
    }

    const smoothingRadius = Math.max(1, Math.round(1 + smoothingRatio * 7));
    const firstPassValues = applyWeightedMovingAverage(values, smoothingRadius);
    const secondPassValues = smoothingRatio >= 0.55
        ? applyWeightedMovingAverage(firstPassValues, Math.max(1, Math.round(smoothingRadius * 0.7)))
        : firstPassValues;

    return values.map((value, valueIndex) =>
        value * (1 - smoothingRatio) + secondPassValues[valueIndex] * smoothingRatio
    );
}

function applyWeightedMovingAverage(values: readonly number[], radius: number): readonly number[] {
    return values.map((ignoredValue, valueIndex) => {
        let weightedSum = 0;
        let totalWeight = 0;

        for (let offset = -radius; offset <= radius; offset++) {
            const sampleIndex = valueIndex + offset;

            if (sampleIndex < 0 || sampleIndex >= values.length) {
                continue;
            }

            const weight = radius + 1 - Math.abs(offset);
            weightedSum += values[sampleIndex] * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? weightedSum / totalWeight : values[valueIndex];
    });
}

/**
 * Converts chronological points to a Catmull-Rom-inspired cubic Bezier path.
 * The curve is visually smooth without moving through invented extrema.
 */
function buildSmoothPath(points: readonly SparklinePoint[]): string {
    if (points.length === 0) {
        return "";
    }

    if (points.length === 1) {
        const point = points[0];
        return `M ${formatSvgNumber(point.xCoordinate)} ${formatSvgNumber(point.yCoordinate)}`;
    }

    const commands = [`M ${formatSvgNumber(points[0].xCoordinate)} ${formatSvgNumber(points[0].yCoordinate)}`];

    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
        const previousPoint = points[Math.max(0, pointIndex - 1)];
        const currentPoint = points[pointIndex];
        const nextPoint = points[pointIndex + 1];
        const followingPoint = points[Math.min(points.length - 1, pointIndex + 2)];
        const controlStartXCoordinate = currentPoint.xCoordinate + (nextPoint.xCoordinate - previousPoint.xCoordinate) / 6;
        const controlStartYCoordinate = currentPoint.yCoordinate + (nextPoint.yCoordinate - previousPoint.yCoordinate) / 6;
        const controlEndXCoordinate = nextPoint.xCoordinate - (followingPoint.xCoordinate - currentPoint.xCoordinate) / 6;
        const controlEndYCoordinate = nextPoint.yCoordinate - (followingPoint.yCoordinate - currentPoint.yCoordinate) / 6;

        commands.push([
            "C",
            formatSvgNumber(controlStartXCoordinate),
            formatSvgNumber(controlStartYCoordinate),
            formatSvgNumber(controlEndXCoordinate),
            formatSvgNumber(controlEndYCoordinate),
            formatSvgNumber(nextPoint.xCoordinate),
            formatSvgNumber(nextPoint.yCoordinate),
        ].join(" "));
    }

    return commands.join(" ");
}

function buildAreaPath(
    points: readonly SparklinePoint[],
    chartLayout: ChartLayout,
): string {
    if (points.length === 0) {
        return "";
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const baselineYCoordinate = chartLayout.yCoordinate + chartLayout.height;

    return [
        buildSmoothPath(points),
        `L ${formatSvgNumber(lastPoint.xCoordinate)} ${formatSvgNumber(baselineYCoordinate)}`,
        `L ${formatSvgNumber(firstPoint.xCoordinate)} ${formatSvgNumber(baselineYCoordinate)}`,
        "Z",
    ].join(" ");
}

function buildPlotLayout(
    chartLayout: ChartLayout,
    guideStyle: SparklineChartGuideStyle,
): ChartLayout {
    if (guideStyle === "time-axis") {
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

function renderChartGuides(options: {
    chartLayout: ChartLayout;
    plotLayout: ChartLayout;
    guideStyle: SparklineChartGuideStyle;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
}): string {
    if (options.guideStyle === "time-axis") {
        return renderTimeAxisGuides(options);
    }

    return renderHorizontalGuides({ plotLayout: options.plotLayout });
}

function renderHorizontalGuides(options: {
    plotLayout: ChartLayout;
}): string {
    const guideList = [1, 0.5, 0].map(progress => {
        const yCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height * (1 - progress);

        return `
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(yCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(yCoordinate)}"
                stroke="${HORIZONTAL_GUIDE_LINE_COLOR}" stroke-width="1"
                stroke-dasharray="4 4" stroke-linecap="round" />
        `;
    });

    return `
        <g>
            ${guideList.join("")}
        </g>
    `;
}

function renderTimeAxisGuides(options: {
    chartLayout: ChartLayout;
    plotLayout: ChartLayout;
    timeGuideTickCount: number;
    historyWindowSeconds: number;
}): string {
    const safeTickCount = Math.max(2, Math.round(options.timeGuideTickCount));
    const baselineYCoordinate = options.plotLayout.yCoordinate + options.plotLayout.height;
    const internalGuideList = Array.from({ length: Math.max(0, safeTickCount - 2) }, (ignoredValue, guideIndex) => {
        const tickIndex = guideIndex + 1;
        const xCoordinate = options.plotLayout.xCoordinate + (options.plotLayout.width * tickIndex) / (safeTickCount - 1);
        const labelSeconds = Math.round(options.historyWindowSeconds * (1 - tickIndex / (safeTickCount - 1)));

        return `
            <line x1="${formatSvgNumber(xCoordinate)}" y1="${formatSvgNumber(options.plotLayout.yCoordinate)}"
                x2="${formatSvgNumber(xCoordinate)}" y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${TIME_GUIDE_LINE_COLOR}" stroke-width="${TIME_GUIDE_LINE_WIDTH}"
                stroke-linecap="round" />
            <line x1="${formatSvgNumber(xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
                x2="${formatSvgNumber(xCoordinate)}" y2="${formatSvgNumber(baselineYCoordinate + TIME_GUIDE_TICK_HEIGHT)}"
                stroke="${TIME_GUIDE_LINE_COLOR}" stroke-width="${TIME_GUIDE_LINE_WIDTH}"
                stroke-linecap="round" />
            ${renderConstrainedSvgText({
                id: `sparkline-time-${tickIndex}`,
                text: `${labelSeconds}s`,
                xCoordinate,
                yCoordinate: baselineYCoordinate + CHART_LABEL_BAND_HEIGHT - 2,
                maxWidth: 24,
                fontSize: 10,
                fontFamily: SPARKLINE_TEXT_FONT_FAMILY,
                fontWeight: 750,
                fill: TIME_LABEL_COLOR,
                textAnchor: "middle",
            })}
        `;
    });

    return `
        <g>
            <rect x="${formatSvgNumber(options.chartLayout.xCoordinate)}" y="${formatSvgNumber(options.chartLayout.yCoordinate)}"
                width="${formatSvgNumber(options.chartLayout.width)}" height="${formatSvgNumber(options.chartLayout.height)}"
                rx="${CHART_PANEL_RADIUS}" fill="${CHART_PANEL_FILL}" stroke="${CHART_PANEL_STROKE}" stroke-width="1" />
            ${internalGuideList.join("")}
            <line x1="${formatSvgNumber(options.plotLayout.xCoordinate)}" y1="${formatSvgNumber(baselineYCoordinate)}"
                x2="${formatSvgNumber(options.plotLayout.xCoordinate + options.plotLayout.width)}"
                y2="${formatSvgNumber(baselineYCoordinate)}"
                stroke="${BASELINE_COLOR}" stroke-width="1" stroke-dasharray="4 4" stroke-linecap="round" />
        </g>
    `;
}

function renderLatestPointGlow(point: SparklinePoint, color: string, filterId: string): string {
    return `
        <circle cx="${formatSvgNumber(point.xCoordinate)}" cy="${formatSvgNumber(point.yCoordinate)}"
            r="5.5" fill="${color}" opacity="0.34" filter="url(#${filterId})" />
    `;
}

function formatCurrentUnit(unit: string): string {
    return unit;
}

function formatSvgNumber(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;

    return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2);
}

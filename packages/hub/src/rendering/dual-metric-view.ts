import type { ColorConfig } from "./color-resolver";
import type { RenderPaintTokens } from "./render-appearance";
import type { RenderTypographyTokens } from "./render-typography";
import type { DualChannelWidgetData, KeySize } from "./widget-data";
import type { ArcGaugeStatusIcon, ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import {
    DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG,
    renderDualChannelArcGauge,
    type DualChannelArcGaugeCenterContent,
} from "../widgets/primitives/dual-channel-arc-gauge";
import {
    DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
    renderDualChannelSparkline,
    type DualChannelSparklineMode,
} from "../widgets/primitives/dual-channel-sparkline";
import {
    DEFAULT_TEXT_METRIC_CONFIG,
    renderDualTextMetric,
} from "../widgets/primitives/text-metric";
import type {
    SparklineGridLineType,
    SparklineGridLineVisibility,
} from "../widgets/primitives/sparkline";

type DualMetricGraphicType = "circular" | "text" | "sparkline";

interface DualMetricChannelViewProps {
    color: string;
    colorConfig?: ColorConfig;
    icon?: string;
    statusIcon?: ArcGaugeStatusIcon;
}

export interface DualMetricBodyViewProps {
    data: DualChannelWidgetData;
    visual: {
        paints: RenderPaintTokens;
        typography: RenderTypographyTokens;
        lineSmoothingPercent: number;
        gridLineVisibility: SparklineGridLineVisibility;
        gridLineType: SparklineGridLineType;
    };
    graphicType: DualMetricGraphicType;
    renderSize: KeySize;
    titleText: string;
    chartMode: DualChannelSparklineMode;
    centerContent: DualChannelArcGaugeCenterContent;
    circleStyle: ArcGaugeStyle;
    topIcon: string;
    positive: DualMetricChannelViewProps;
    negative: DualMetricChannelViewProps;
}

export function renderDualMetricBodyView(options: DualMetricBodyViewProps): string {
    switch (options.graphicType) {
        case "circular":
            return renderDualCircularMetric(options);
        case "text":
            return renderDualTextMetricView(options);
        case "sparkline":
            return renderDualSparklineMetric(options);
    }
}

function renderDualCircularMetric(options: DualMetricBodyViewProps): string {
    return renderDualChannelArcGauge(options.data, {
        ...DEFAULT_DUAL_CHANNEL_ARC_GAUGE_CONFIG,
        trackColor: options.visual.paints.track,
        valueTextColor: options.visual.paints.primaryText,
        unitTextColor: options.visual.paints.secondaryText,
        dividerColor: options.visual.paints.divider,
        iconColor: options.visual.paints.icon,
        typography: options.visual.typography,
        positiveColor: options.positive.color,
        negativeColor: options.negative.color,
        positiveColorConfig: options.positive.colorConfig,
        negativeColorConfig: options.negative.colorConfig,
        titleText: options.titleText,
        centerContent: options.centerContent,
        circleStyle: options.circleStyle,
        centerIconFragment: options.topIcon,
        positiveIconFragment: options.positive.icon,
        negativeIconFragment: options.negative.icon,
        positiveStatusIcon: options.positive.statusIcon,
        negativeStatusIcon: options.negative.statusIcon,
    }, options.renderSize);
}

function renderDualTextMetricView(options: DualMetricBodyViewProps): string {
    return renderDualTextMetric(options.data, {
        ...DEFAULT_TEXT_METRIC_CONFIG,
        labelTextColor: options.visual.paints.secondaryText,
        unitTextColor: options.visual.paints.secondaryText,
        secondaryTextColor: options.visual.paints.mutedText,
        typography: options.visual.typography,
        positiveColor: options.positive.color,
        negativeColor: options.negative.color,
    }, options.renderSize);
}

function renderDualSparklineMetric(options: DualMetricBodyViewProps): string {
    return renderDualChannelSparkline(options.data, {
        ...DEFAULT_DUAL_CHANNEL_SPARKLINE_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        positiveColor: options.positive.color,
        negativeColor: options.negative.color,
        titleText: options.titleText,
        chartMode: options.chartMode,
        topIconFragment: options.topIcon,
        positiveIconFragment: options.positive.icon,
        negativeIconFragment: options.negative.icon,
        lineSmoothingPercent: options.visual.lineSmoothingPercent,
        gridLineVisibility: options.visual.gridLineVisibility,
        gridLineType: options.visual.gridLineType,
        paints: {
            primaryText: options.visual.paints.primaryText,
            secondaryText: options.visual.paints.secondaryText,
            supportingText: options.visual.paints.secondaryText,
            icon: options.visual.paints.icon,
            grid: options.visual.paints.grid,
            baseline: options.visual.paints.grid,
        },
        typography: options.visual.typography,
    }, options.renderSize);
}

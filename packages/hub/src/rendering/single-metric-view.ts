import type { RenderPaintTokens } from "./render-appearance";
import type { KeySize, WidgetData } from "./widget-data";
import {
    arcGauge,
    DEFAULT_ARC_GAUGE_CONFIG,
    type ArcGaugeStatusIcon,
    type ArcGaugeStyle,
} from "../widgets/primitives/arc-gauge";
import {
    DEFAULT_TEXT_METRIC_CONFIG,
    textMetric,
} from "../widgets/primitives/text-metric";
import {
    DEFAULT_LINEAR_BAR_CONFIG,
    linearBar,
} from "../widgets/primitives/linear-bar";
import {
    DEFAULT_SPARKLINE_CONFIG,
    sparkline,
    type SparklineGridLineType,
    type SparklineGridLineVisibility,
} from "../widgets/primitives/sparkline";

type SingleMetricGraphicType = "circular" | "text" | "linear" | "sparkline";

export interface SingleMetricBodyViewProps {
    data: WidgetData;
    visual: {
        graphicType: SingleMetricGraphicType;
        paints: RenderPaintTokens;
        lineSmoothingPercent: number;
        gridLineVisibility: SparklineGridLineVisibility;
        gridLineType: SparklineGridLineType;
    };
    renderSize: KeySize;
    centerIcon: string;
    footerIcon?: string;
    linearIcon?: string;
    statusIcon?: ArcGaugeStatusIcon;
    circleStyle: ArcGaugeStyle;
}

export function renderSingleMetricBodyView(options: SingleMetricBodyViewProps): string {
    switch (options.visual.graphicType) {
        case "circular":
            return renderSingleCircularMetric(options);
        case "text":
            return renderSingleTextMetric(options);
        case "linear":
            return renderSingleLinearMetric(options);
        case "sparkline":
            return renderSingleSparklineMetric(options);
    }
}

function renderSingleCircularMetric(options: SingleMetricBodyViewProps): string {
    return arcGauge.render(options.data, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        trackColor: options.visual.paints.track,
        labelTextColor: options.visual.paints.secondaryText,
        valueTextColor: options.visual.paints.primaryText,
        unitTextColor: options.visual.paints.secondaryText,
        iconColor: options.visual.paints.icon,
        circleStyle: options.circleStyle,
        centerIconFragment: options.centerIcon,
        footerIconFragment: options.footerIcon,
        statusIcon: options.statusIcon,
    }, options.renderSize);
}

function renderSingleTextMetric(options: SingleMetricBodyViewProps): string {
    return textMetric.render(options.data, {
        ...DEFAULT_TEXT_METRIC_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        labelTextColor: options.visual.paints.secondaryText,
        unitTextColor: options.visual.paints.secondaryText,
        secondaryTextColor: options.visual.paints.mutedText,
    }, options.renderSize);
}

function renderSingleLinearMetric(options: SingleMetricBodyViewProps): string {
    return linearBar.render(options.data, {
        ...DEFAULT_LINEAR_BAR_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        paints: {
            primaryText: options.visual.paints.linearValueText,
            secondaryText: options.visual.paints.linearTitleText,
            supportingText: options.visual.paints.linearUnitText,
            mutedText: options.visual.paints.linearSecondaryText,
            icon: options.visual.paints.icon,
            track: options.visual.paints.track,
        },
        topIconFragment: options.linearIcon ?? options.centerIcon,
    }, options.renderSize);
}

function renderSingleSparklineMetric(options: SingleMetricBodyViewProps): string {
    return sparkline.render(options.data, {
        ...DEFAULT_SPARKLINE_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        lineSmoothingPercent: options.visual.lineSmoothingPercent,
        gridLineVisibility: options.visual.gridLineVisibility,
        gridLineType: options.visual.gridLineType,
        paints: {
            primaryText: options.visual.paints.primaryText,
            secondaryText: options.visual.paints.secondaryText,
            supportingText: options.visual.paints.secondaryText,
            mutedText: options.visual.paints.mutedText,
            icon: options.visual.paints.icon,
            surface: options.visual.paints.surface,
            divider: options.visual.paints.divider,
            grid: options.visual.paints.grid,
            baseline: options.visual.paints.grid,
        },
        topIconFragment: options.linearIcon ?? options.centerIcon,
    }, options.renderSize);
}

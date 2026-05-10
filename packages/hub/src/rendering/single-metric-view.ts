import type { ColorConfig } from "./color-resolver";
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

type SingleMetricGraphicType = "circular" | "text" | "linear" | "dashed-line";

export interface SingleMetricBodyViewProps {
    data: WidgetData;
    visual: {
        graphicType: SingleMetricGraphicType;
        colorConfig: ColorConfig;
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
        case "dashed-line":
            return renderSingleSparklineMetric(options);
    }
}

function renderSingleCircularMetric(options: SingleMetricBodyViewProps): string {
    return arcGauge.render(options.data, {
        ...DEFAULT_ARC_GAUGE_CONFIG,
        colorConfig: options.visual.colorConfig,
        circleStyle: options.circleStyle,
        centerIconFragment: options.centerIcon,
        footerIconFragment: options.footerIcon,
        statusIcon: options.statusIcon,
    }, options.renderSize);
}

function renderSingleTextMetric(options: SingleMetricBodyViewProps): string {
    return textMetric.render(options.data, {
        ...DEFAULT_TEXT_METRIC_CONFIG,
        colorConfig: options.visual.colorConfig,
    }, options.renderSize);
}

function renderSingleLinearMetric(options: SingleMetricBodyViewProps): string {
    return linearBar.render(options.data, {
        ...DEFAULT_LINEAR_BAR_CONFIG,
        colorConfig: options.visual.colorConfig,
        topIconFragment: options.linearIcon ?? options.centerIcon,
    }, options.renderSize);
}

function renderSingleSparklineMetric(options: SingleMetricBodyViewProps): string {
    return sparkline.render(options.data, {
        ...DEFAULT_SPARKLINE_CONFIG,
        colorConfig: options.visual.colorConfig,
        lineSmoothingPercent: options.visual.lineSmoothingPercent,
        gridLineVisibility: options.visual.gridLineVisibility,
        gridLineType: options.visual.gridLineType,
        topIconFragment: options.linearIcon ?? options.centerIcon,
    }, options.renderSize);
}

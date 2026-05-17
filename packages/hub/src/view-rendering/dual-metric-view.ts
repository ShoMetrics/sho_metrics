import type { ColorConfig } from "./color-resolver";
import type { RenderPaintTokens } from "./render-appearance";
import type { RenderTextStyles } from "./render-text-style";
import type { RenderThemeEffectTokens } from "./render-svg-effects";
import type { DualChannelWidgetData, KeySize } from "./widget-data";
import type { ProgressCircleStatusIcon, CircleVariant } from "../widgets/primitives/progress-circle";
import {
    DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
    renderDualChannelProgressCircle,
    type DualChannelProgressCircleCenterContent,
} from "../widgets/primitives/dual-channel-progress-circle";
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

type DualMetricRenderPrimitive = "circle" | "text" | "sparkline";

interface DualMetricChannelViewProps {
    color: string;
    colorConfig?: ColorConfig;
    icon?: string;
    statusIcon?: ProgressCircleStatusIcon;
}

export interface DualMetricBodyViewProps {
    data: DualChannelWidgetData;
    visual: {
        paints: RenderPaintTokens;
        textStyles: RenderTextStyles;
        themeEffects: RenderThemeEffectTokens;
        lineSmoothingPercent: number;
        gridLineVisibility: SparklineGridLineVisibility;
        gridLineType: SparklineGridLineType;
    };
    renderPrimitive: DualMetricRenderPrimitive;
    renderSize: KeySize;
    titleText: string;
    chartMode: DualChannelSparklineMode;
    centerContent: DualChannelProgressCircleCenterContent;
    circleVariant: CircleVariant;
    topIcon: string;
    positive: DualMetricChannelViewProps;
    negative: DualMetricChannelViewProps;
}

export function renderDualMetricBodyView(options: DualMetricBodyViewProps): string {
    switch (options.renderPrimitive) {
        case "circle":
            return renderDualCircularMetric(options);
        case "text":
            return renderDualTextMetricView(options);
        case "sparkline":
            return renderDualSparklineMetric(options);
    }
}

function renderDualCircularMetric(options: DualMetricBodyViewProps): string {
    return renderDualChannelProgressCircle(options.data, {
        ...DEFAULT_DUAL_CHANNEL_PROGRESS_CIRCLE_CONFIG,
        trackColor: options.visual.paints.track,
        valueTextColor: options.visual.paints.primaryText,
        unitTextColor: options.visual.paints.secondaryText,
        dividerColor: options.visual.paints.divider,
        iconColor: options.visual.paints.icon,
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        positiveColor: options.positive.color,
        negativeColor: options.negative.color,
        positiveColorConfig: options.positive.colorConfig,
        negativeColorConfig: options.negative.colorConfig,
        titleText: options.titleText,
        centerContent: options.centerContent,
        circleVariant: options.circleVariant,
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
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
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
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
    }, options.renderSize);
}

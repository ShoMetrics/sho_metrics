import type {
    RenderPaintTokens,
    RenderTransparentSurfaceTokens,
    TextMetricVariant,
} from "./render-appearance";
import type { RenderTextStyles } from "./render-text-style";
import type { RenderThemeEffectTokens } from "./render-svg-effects";
import type { KeySize, WidgetData } from "./widget-data";
import {
    progressCircle,
    DEFAULT_PROGRESS_CIRCLE_CONFIG,
    type ProgressCircleStatusIcon,
    type CircleVariant,
} from "../widgets/primitives/progress-circle";
import {
    DEFAULT_TEXT_METRIC_CONFIG,
    renderCenteredTextMetric,
} from "../widgets/primitives/text-metric";
import { renderTitleCardTextMetric } from "../widgets/primitives/title-card-text-metric";
import { buildTitleCardSingleMetricContent } from "./text-content/title-card-text-content";
import {
    DEFAULT_PROGRESS_BAR_CONFIG,
    progressBar,
} from "../widgets/primitives/progress-bar";
import {
    DEFAULT_SPARKLINE_CONFIG,
    sparkline,
    type SparklineGridLineType,
    type SparklineGridLineVisibility,
} from "../widgets/primitives/sparkline";

type SingleMetricRenderPrimitive = "circle" | "text" | "bar" | "sparkline";

export interface SingleMetricBodyViewProps {
    data: WidgetData;
    visual: {
        renderPrimitive: SingleMetricRenderPrimitive;
        paints: RenderPaintTokens;
        transparentSurface: RenderTransparentSurfaceTokens;
        textStyles: RenderTextStyles;
        themeEffects: RenderThemeEffectTokens;
        textVariant: TextMetricVariant;
        lineSmoothingPercent: number;
        gridLineVisibility: SparklineGridLineVisibility;
        gridLineType: SparklineGridLineType;
    };
    renderSize: KeySize;
    centerIcon: string;
    footerIcon?: string;
    topIcon?: string;
    statusIcon?: ProgressCircleStatusIcon;
    circleVariant: CircleVariant;
}

export function renderSingleMetricBodyView(options: SingleMetricBodyViewProps): string {
    switch (options.visual.renderPrimitive) {
        case "circle":
            return renderSingleCircularMetric(options);
        case "text":
            return renderSingleTextMetric(options);
        case "bar":
            return renderSingleBarMetric(options);
        case "sparkline":
            return renderSingleSparklineMetric(options);
    }
}

function renderSingleCircularMetric(options: SingleMetricBodyViewProps): string {
    return progressCircle.render(options.data, {
        ...DEFAULT_PROGRESS_CIRCLE_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        trackColor: options.visual.paints.track,
        labelTextColor: options.visual.paints.secondaryText,
        valueTextColor: options.visual.paints.primaryText,
        unitTextColor: options.visual.paints.secondaryText,
        iconColor: options.visual.paints.icon,
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        circleVariant: options.circleVariant,
        centerIconFragment: options.centerIcon,
        footerIconFragment: options.footerIcon,
        statusIcon: options.statusIcon,
    }, options.renderSize);
}

function renderSingleTextMetric(options: SingleMetricBodyViewProps): string {
    const config = {
        ...DEFAULT_TEXT_METRIC_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        labelTextColor: options.visual.paints.secondaryText,
        valueTextColor: options.visual.paints.metricValueText,
        unitTextColor: options.visual.paints.secondaryText,
        secondaryTextColor: options.visual.paints.mutedText,
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
    };

    if (options.visual.textVariant === "title-card") {
        return renderTitleCardTextMetric(
            options.data,
            config,
            options.renderSize,
            buildTitleCardSingleMetricContent(options.data),
        );
    }

    return renderCenteredTextMetric(options.data, config, options.renderSize);
}

function renderSingleBarMetric(options: SingleMetricBodyViewProps): string {
    return progressBar.render(options.data, {
        ...DEFAULT_PROGRESS_BAR_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        paints: {
            primaryText: options.visual.paints.barValueText,
            secondaryText: options.visual.paints.barTitleText,
            supportingText: options.visual.paints.barUnitText,
            mutedText: options.visual.paints.barSecondaryText,
            icon: options.visual.paints.icon,
            track: options.visual.paints.track,
        },
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        topIconFragment: options.topIcon ?? options.centerIcon,
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
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        topIconFragment: options.topIcon ?? options.centerIcon,
    }, options.renderSize);
}

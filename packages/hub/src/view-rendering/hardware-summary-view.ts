import type { HardwareSummaryWidgetData } from "../actions/hardware-summary/widget-data";
import {
    DEFAULT_SEMI_CIRCLE_GAUGE_PANEL_CONFIG,
    renderSemiCircleGaugePanel,
    type SemiCircleGaugePanelData,
} from "../widgets/primitives/semi-circle-gauge-panel";
import type { KeySize } from "./widget-data";
import type { MetricRenderAppearance } from "./render-appearance";

/** Inputs for adapting hardware summary widget data to the metric frame body viewport. */
export interface HardwareSummaryBodyViewProps {
    readonly data: HardwareSummaryWidgetData;
    readonly visual: MetricRenderAppearance;
    readonly renderSize: KeySize;
    readonly domainIconFragment: string;
}

/** Renders only the metric body for the fixed CPU/GPU three-reading summary view. */
export function renderHardwareSummaryBodyView(options: HardwareSummaryBodyViewProps): string {
    return renderSemiCircleGaugePanel(toSemiCircleGaugePanelData(options.data), {
        ...DEFAULT_SEMI_CIRCLE_GAUGE_PANEL_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        paints: {
            primaryText: options.visual.paints.primaryText,
            secondaryText: options.visual.paints.secondaryText,
            mutedText: options.visual.paints.mutedText,
            icon: options.visual.paints.icon,
            track: options.visual.paints.track,
            divider: options.visual.paints.divider,
        },
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        shapeOutline: options.visual.transparentSurface.shapeOutline,
        icons: {
            title: options.domainIconFragment,
        },
    }, options.renderSize);
}

function toSemiCircleGaugePanelData(data: HardwareSummaryWidgetData): SemiCircleGaugePanelData {
    return {
        title: data.domain.toUpperCase(),
        primary: data.primary,
        secondary: data.secondary,
    };
}

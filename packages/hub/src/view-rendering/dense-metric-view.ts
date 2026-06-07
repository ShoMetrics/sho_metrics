import type { DenseMetricWidgetData } from "../actions/dense-multi-metric/row-data";
import type { MetricRenderAppearance } from "./render-appearance";
import type { KeySize } from "./widget-data";
import {
    DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
    renderDenseProgressList,
} from "../widgets/primitives/dense-progress-list";

export interface DenseMetricBodyViewProps {
    readonly data: DenseMetricWidgetData;
    readonly visual: MetricRenderAppearance;
    readonly renderSize: KeySize;
}

/** Renders only the metric body for the dense progress-list view. */
export function renderDenseMetricBodyView(options: DenseMetricBodyViewProps): string {
    return renderDenseProgressList(options.data, {
        ...DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        paints: {
            labelText: options.visual.paints.secondaryText,
            valueText: options.visual.paints.metricValueText,
            unitText: options.visual.paints.secondaryText,
            track: options.visual.paints.track,
        },
        textStyles: options.visual.textStyles,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        shapeOutline: options.visual.transparentSurface.shapeOutline,
    }, options.renderSize);
}

import type { DenseMetricWidgetData } from "../../actions/dense-multi-metric/row-data";
import type { MetricRenderAppearance } from "../color/render-appearance";
import type { KeySize } from "../widget-data";
import {
    DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
    type DenseProgressListFillTintedTrack,
    renderDenseProgressList,
} from "../../widgets/primitives/dense-progress-list";

const TERMINAL_FILL_TINTED_TRACK_LIGHTEN_PERCENT = 55;
const PIXEL_WINDOW_FILL_TINTED_TRACK_LIGHTEN_PERCENT = 10;

/** Describes dense-only theme choices before handing colors to the primitive. */
interface DenseThemeRenderStrategy {
    /** Uses a track color derived from each row's filled progress color. */
    readonly fillTintedTrack?: DenseProgressListFillTintedTrack;
    readonly labelLetterSpacingEm?: number;
}

export interface DenseMetricBodyViewProps {
    readonly data: DenseMetricWidgetData;
    readonly visual: MetricRenderAppearance;
    readonly renderSize: KeySize;
}

/** Renders only the metric body for the dense progress-list view. */
export function renderDenseMetricBodyView(options: DenseMetricBodyViewProps): string {
    const themeStrategy = resolveDenseThemeRenderStrategy(options.visual.themePreset);

    return renderDenseProgressList(options.data, {
        ...DEFAULT_DENSE_PROGRESS_LIST_CONFIG,
        colorConfig: options.visual.paints.primaryMetric,
        paints: {
            labelText: options.visual.paints.secondaryText,
            valueText: options.visual.paints.metricValueText,
            unitText: options.visual.paints.secondaryText,
            track: options.visual.paints.track,
        },
        fillTintedTrack: themeStrategy.fillTintedTrack,
        textStyles: options.visual.textStyles,
        labelLetterSpacingEm: themeStrategy.labelLetterSpacingEm,
        themeEffects: options.visual.themeEffects,
        textOutline: options.visual.transparentSurface.textOutline,
        shapeOutline: options.visual.transparentSurface.shapeOutline,
    }, options.renderSize);
}

function resolveDenseThemeRenderStrategy(
    themePreset: MetricRenderAppearance["themePreset"],
): DenseThemeRenderStrategy {
    switch (themePreset) {
        case "terminal-clean":
        case "terminal-vintage":
            return {
                fillTintedTrack: {
                    trackLightenPercent: TERMINAL_FILL_TINTED_TRACK_LIGHTEN_PERCENT,
                },
            };
        case "pixel-window":
            return {
                fillTintedTrack: {
                    trackLightenPercent: PIXEL_WINDOW_FILL_TINTED_TRACK_LIGHTEN_PERCENT,
                },
                labelLetterSpacingEm: 0,
            };
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return {};
    }

    const unhandledThemePreset: never = themePreset;
    return unhandledThemePreset;
}

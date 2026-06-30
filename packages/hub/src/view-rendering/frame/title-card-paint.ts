import type { RenderPaintTokens } from "../color/render-appearance";

/**
 * Resolves the static code and caption paint for title-card metrics.
 *
 * Solid color themes such as terminal should tint the EVA-style static text.
 * Threshold themes keep the static text neutral because the live metric values
 * own threshold-dependent color changes.
 */
export function resolveTitleCardStaticTextColor(paints: RenderPaintTokens): string {
    return paints.primaryMetric.mode === "solid"
        ? paints.primaryMetric.solidColor
        : paints.metricValueText;
}

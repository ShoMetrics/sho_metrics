import type { MetricRenderAppearance } from "../rendering/render-appearance";
import type { ResolvedAppearanceSettings } from "./resolved-settings";
import { resolveRenderGraphicEffects } from "./render-graphic-effects-resolver";
import { resolveRenderPaint } from "./render-paint-resolver";
import { resolveRenderTextStyles } from "./render-text-style-resolver";

export function buildMetricRenderAppearance(
    settings: ResolvedAppearanceSettings,
): MetricRenderAppearance {
    const renderPaint = resolveRenderPaint(settings);

    return {
        graphicType: settings.graph.viewLayout,
        circleStyle: settings.graph.circleStyle,
        graphicStyle: settings.theme.selectedTheme,
        paintConstraint: renderPaint.paintConstraint,
        paints: renderPaint.paintTokens,
        textStyles: resolveRenderTextStyles(settings),
        graphicEffects: resolveRenderGraphicEffects(settings),
        lineSmoothingPercent: settings.sparkline.lineSmoothingPercent,
        gridLineVisibility: settings.sparkline.gridLineVisibility,
        gridLineType: settings.sparkline.gridLineType,
    };
}

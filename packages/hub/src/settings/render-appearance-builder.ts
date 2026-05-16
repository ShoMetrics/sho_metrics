import type { MetricRenderAppearance } from "../rendering/render-appearance";
import type { ResolvedAppearanceSettings } from "./resolved-settings";
import { resolveRenderPaint } from "./render-paint-resolver";
import { resolveRenderTypography } from "./render-typography-resolver";

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
        typography: resolveRenderTypography(settings),
        lineSmoothingPercent: settings.sparkline.lineSmoothingPercent,
        gridLineVisibility: settings.sparkline.gridLineVisibility,
        gridLineType: settings.sparkline.gridLineType,
    };
}

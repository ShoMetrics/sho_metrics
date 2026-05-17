import type { MetricRenderAppearance } from "../rendering/render-appearance";
import type { ArcGaugeStyle } from "../widgets/primitives/arc-gauge";
import type { GraphicThemePresetName } from "../widgets/widget.interface";
import type {
    CircleViewVariant,
    MetricView,
    ResolvedAppearanceSettings,
    ResolvedAppearanceThemeSettings,
} from "./resolved-settings";
import { resolveRenderGraphicEffects } from "./render-graphic-effects-resolver";
import { resolveRenderPaint } from "./render-paint-resolver";
import { resolveRenderTextStyles } from "./render-text-style-resolver";

export function buildMetricRenderAppearance(
    settings: ResolvedAppearanceSettings,
): MetricRenderAppearance {
    const renderPaint = resolveRenderPaint(settings);

    return {
        graphicType: resolveRenderPrimitive(settings.view.selectedView),
        circleStyle: resolveArcGaugeStyle(settings.view.circleVariant),
        graphicStyle: resolveThemePresetName(settings.theme),
        paintConstraint: renderPaint.paintConstraint,
        paints: renderPaint.paintTokens,
        textStyles: resolveRenderTextStyles(settings),
        graphicEffects: resolveRenderGraphicEffects(settings),
        lineSmoothingPercent: settings.line.lineSmoothingPercent,
        gridLineVisibility: settings.line.gridLineVisibility,
        gridLineType: settings.line.gridLineType,
    };
}

export function resolveRenderPrimitive(view: MetricView): MetricRenderAppearance["graphicType"] {
    switch (view) {
        case "circle":
            return "circular";
        case "text":
            return "text";
        case "bar":
            return "linear";
        case "line":
            return "sparkline";
    }
}

export function resolveArcGaugeStyle(variant: CircleViewVariant): ArcGaugeStyle {
    switch (variant) {
        case "full-ring":
            return "value";
        case "minimal":
            return "compact";
        case "gauge":
            return "gauge";
    }
}

function resolveThemePresetName(theme: ResolvedAppearanceThemeSettings): GraphicThemePresetName {
    switch (theme.selectedTheme) {
        case "terminal":
            return theme.terminal.variant === "vintage" ? "terminal-vintage" : "terminal-clean";
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return theme.selectedTheme;
    }
}

import type { MetricRenderAppearance } from "../rendering/render-appearance";
import type { ThemePresetName } from "../widgets/widget.interface";
import type {
    MetricView,
    ResolvedAppearanceSettings,
    ResolvedAppearanceThemeSettings,
} from "./resolved-settings";
import { resolveRenderThemeEffects } from "./render-theme-effects-resolver";
import { resolveRenderPaint } from "./render-paint-resolver";
import { resolveRenderTextStyles } from "./render-text-style-resolver";

export function buildMetricRenderAppearance(
    settings: ResolvedAppearanceSettings,
): MetricRenderAppearance {
    const renderPaint = resolveRenderPaint(settings);

    return {
        renderPrimitive: resolveRenderPrimitive(settings.view.selectedView),
        circleVariant: settings.view.circleVariant,
        themePreset: resolveThemePresetName(settings.theme),
        paintConstraint: renderPaint.paintConstraint,
        paints: renderPaint.paintTokens,
        textStyles: resolveRenderTextStyles(settings),
        themeEffects: resolveRenderThemeEffects(settings),
        lineSmoothingPercent: settings.line.lineSmoothingPercent,
        gridLineVisibility: settings.line.gridLineVisibility,
        gridLineType: settings.line.gridLineType,
    };
}

function resolveRenderPrimitive(view: MetricView): MetricRenderAppearance["renderPrimitive"] {
    switch (view) {
        case "circle":
            return "circle";
        case "text":
            return "text";
        case "bar":
            return "bar";
        case "line":
            return "sparkline";
    }
}

function resolveThemePresetName(theme: ResolvedAppearanceThemeSettings): ThemePresetName {
    switch (theme.selectedTheme) {
        case "terminal":
            return theme.terminal.variant === "vintage" ? "terminal-vintage" : "terminal-clean";
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return theme.selectedTheme;
    }
}

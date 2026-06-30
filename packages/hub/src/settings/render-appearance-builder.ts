import type { MetricRenderAppearance } from "../view-rendering/color/render-appearance";
import type { ThemePresetName } from "../widgets/widget-contract";
import type {
    MetricView,
    ResolvedAppearanceSettings,
    ResolvedAppearanceThemeSettings,
} from "./resolved-settings";
import { resolveRenderThemeEffects } from "./render-theme-effects-resolver";
import { resolveRenderPaint } from "./render-paint-resolver";
import { resolveRenderTransparentSurface } from "./render-transparent-surface-resolver";
import { resolveRenderTextStyles } from "./render-text-style-resolver";

/**
 * Builds renderer-facing appearance tokens from resolved appearance settings.
 *
 * Used before Stream Deck SVG composition so renderer code receives a stable
 * render contract instead of reading product settings directly.
 */
export function buildMetricRenderAppearance(
    settings: ResolvedAppearanceSettings,
): MetricRenderAppearance {
    const renderPaint = resolveRenderPaint(settings);

    return {
        renderPrimitive: resolveRenderPrimitive(settings.view.selectedView),
        circleVariant: settings.view.circleVariant,
        textVariant: settings.view.textVariant,
        themePreset: resolveThemePresetName(settings.theme),
        paintConstraint: renderPaint.paintConstraint,
        paints: renderPaint.paintTokens,
        textStyles: resolveRenderTextStyles(settings),
        themeEffects: resolveRenderThemeEffects(settings),
        transparentSurface: resolveRenderTransparentSurface(settings),
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
        case "pixel-window":
            return "pixel-window";
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return theme.selectedTheme;
    }
}

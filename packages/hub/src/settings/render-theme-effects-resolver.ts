import {
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../view-rendering/render-svg-effects";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

/**
 * Resolves renderer SVG effect tokens for the selected theme.
 *
 * Used by Terminal themes to add scanline, glow, and distortion treatment
 * without changing the user's selected metric view.
 */
export function resolveRenderThemeEffects(settings: ResolvedAppearanceSettings): RenderThemeEffectTokens {
    switch (settings.theme.selectedTheme) {
        case "terminal":
            return settings.theme.terminal.variant === "vintage"
                ? TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS
                : TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
        case "pixel-window":
            return DEFAULT_RENDER_THEME_EFFECT_TOKENS;
    }
}

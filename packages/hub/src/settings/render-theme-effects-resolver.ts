import {
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS,
    type RenderThemeEffectTokens,
} from "../rendering/render-svg-effects";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderThemeEffects(settings: ResolvedAppearanceSettings): RenderThemeEffectTokens {
    switch (settings.theme.selectedTheme) {
        case "terminal":
            return settings.theme.terminal.variant === "vintage"
                ? TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS
                : TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_THEME_EFFECT_TOKENS;
    }
}

import {
    DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
    TERMINAL_CLEAN_RENDER_GRAPHIC_EFFECT_TOKENS,
    TERMINAL_VINTAGE_RENDER_GRAPHIC_EFFECT_TOKENS,
    type RenderGraphicEffectTokens,
} from "../rendering/render-svg-effects";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderGraphicEffects(settings: ResolvedAppearanceSettings): RenderGraphicEffectTokens {
    switch (settings.theme.selectedTheme) {
        case "terminal":
            return settings.theme.terminal.variant === "vintage"
                ? TERMINAL_VINTAGE_RENDER_GRAPHIC_EFFECT_TOKENS
                : TERMINAL_CLEAN_RENDER_GRAPHIC_EFFECT_TOKENS;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS;
    }
}

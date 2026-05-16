import {
    DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS,
    OLD_CRT_RENDER_GRAPHIC_EFFECT_TOKENS,
    type RenderGraphicEffectTokens,
} from "../rendering/render-svg-effects";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderGraphicEffects(settings: ResolvedAppearanceSettings): RenderGraphicEffectTokens {
    switch (settings.theme.selectedTheme) {
        case "old-crt":
            return OLD_CRT_RENDER_GRAPHIC_EFFECT_TOKENS;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_GRAPHIC_EFFECT_TOKENS;
    }
}

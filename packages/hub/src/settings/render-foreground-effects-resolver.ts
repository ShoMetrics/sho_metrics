import {
    DEFAULT_RENDER_FOREGROUND_EFFECT_TOKENS,
    OLD_CRT_RENDER_FOREGROUND_EFFECT_TOKENS,
    type RenderForegroundEffectTokens,
} from "../rendering/render-foreground-effects";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderForegroundEffects(settings: ResolvedAppearanceSettings): RenderForegroundEffectTokens {
    switch (settings.theme.selectedTheme) {
        case "old-crt":
            return OLD_CRT_RENDER_FOREGROUND_EFFECT_TOKENS;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_FOREGROUND_EFFECT_TOKENS;
    }
}

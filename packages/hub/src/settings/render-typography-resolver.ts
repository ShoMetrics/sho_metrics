import {
    DEFAULT_RENDER_TYPOGRAPHY_TOKENS,
    OLD_CRT_RENDER_TYPOGRAPHY_TOKENS,
    type RenderTypographyTokens,
} from "../rendering/render-typography";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderTypography(settings: ResolvedAppearanceSettings): RenderTypographyTokens {
    switch (settings.theme.selectedTheme) {
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_TYPOGRAPHY_TOKENS;
        case "old-crt":
            return OLD_CRT_RENDER_TYPOGRAPHY_TOKENS;
    }
}

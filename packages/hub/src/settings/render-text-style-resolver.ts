import {
    DEFAULT_RENDER_TEXT_STYLES,
    OLD_CRT_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../rendering/render-text-style";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

export function resolveRenderTextStyles(settings: ResolvedAppearanceSettings): RenderTextStyles {
    switch (settings.theme.selectedTheme) {
        case "old-crt":
            return OLD_CRT_RENDER_TEXT_STYLES;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_TEXT_STYLES;
    }
}

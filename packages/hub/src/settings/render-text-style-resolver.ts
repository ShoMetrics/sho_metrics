import {
    DEFAULT_RENDER_TEXT_STYLES,
    TERMINAL_CLEAN_RENDER_TEXT_STYLES,
    TERMINAL_VINTAGE_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../view-rendering/render-text-style";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

/**
 * Resolves renderer text style tokens for the selected theme.
 *
 * Used by Terminal themes to swap font families and text treatment without
 * changing the user's selected metric view.
 */
export function resolveRenderTextStyles(settings: ResolvedAppearanceSettings): RenderTextStyles {
    switch (settings.theme.selectedTheme) {
        case "terminal":
            return settings.theme.terminal.variant === "vintage"
                ? TERMINAL_VINTAGE_RENDER_TEXT_STYLES
                : TERMINAL_CLEAN_RENDER_TEXT_STYLES;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_TEXT_STYLES;
    }
}

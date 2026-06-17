import {
    DEFAULT_RENDER_TEXT_STYLES,
    PIXEL_RENDER_TEXT_STYLES,
    TERMINAL_CLEAN_RENDER_TEXT_STYLES,
    TERMINAL_VINTAGE_RENDER_TEXT_STYLES,
    TITLE_CARD_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../view-rendering/render-text-style";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

/**
 * Resolves renderer text style tokens for the selected view and theme.
 *
 * Title-card text keeps its fixed Japanese serif treatment; other views use
 * theme-owned font families and text treatment.
 */
export function resolveRenderTextStyles(settings: ResolvedAppearanceSettings): RenderTextStyles {
    if (settings.view.selectedView === "text" && settings.view.textVariant === "title-card") {
        return TITLE_CARD_RENDER_TEXT_STYLES;
    }

    switch (settings.theme.selectedTheme) {
        case "terminal":
            return settings.theme.terminal.variant === "vintage"
                ? TERMINAL_VINTAGE_RENDER_TEXT_STYLES
                : TERMINAL_CLEAN_RENDER_TEXT_STYLES;
        case "pixel-window":
            return PIXEL_RENDER_TEXT_STYLES;
        case "flat":
        case "cupertino-glass":
        case "color-filled":
            return DEFAULT_RENDER_TEXT_STYLES;
    }
}

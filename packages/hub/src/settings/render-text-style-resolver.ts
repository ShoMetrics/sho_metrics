import {
    DEFAULT_RENDER_TEXT_STYLES,
    TERMINAL_CLEAN_RENDER_TEXT_STYLES,
    TERMINAL_VINTAGE_RENDER_TEXT_STYLES,
    type RenderTextStyles,
} from "../view-rendering/render-text-style";
import type { ResolvedAppearanceSettings } from "./resolved-settings";

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

import type { KeySize } from "../../view-rendering/widget-data";
import { renderFullBleedThemeBackground, type ThemeStyle, type ThemeStylePaints } from "./theme-style";

/**
 * Flat style: solid dark background, clean minimalist look, no effects.
 */
export const flatStyle: ThemeStyle = {
    styleId: "flat",

    renderDefs(): string {
        return "";
    },

    renderBackground(keySize: KeySize, paints: ThemeStylePaints): string {
        return renderFullBleedThemeBackground(keySize, paints);
    },

    renderOverlay(): string {
        return "";
    },
};

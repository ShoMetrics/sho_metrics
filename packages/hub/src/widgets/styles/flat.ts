import type { KeySize } from "../../rendering/widget-data";
import type { ThemeStyle, ThemeStylePaints } from "./theme-style";

/**
 * Flat style: solid dark background, clean minimalist look, no effects.
 */
export const flatStyle: ThemeStyle = {
    styleId: "flat",

    renderDefs(): string {
        return "";
    },

    renderBackground(keySize: KeySize, paints: ThemeStylePaints): string {
        return `<rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="12" fill="${paints.background}" />`;
    },

    renderOverlay(): string {
        return "";
    },
};

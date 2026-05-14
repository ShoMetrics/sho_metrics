import type { KeySize } from "../../rendering/widget-data";
import type { GraphicStyle, GraphicStylePaints } from "./style.interface";

/**
 * Flat style: solid dark background, clean minimalist look, no effects.
 */
export const flatStyle: GraphicStyle = {
    styleId: "flat",

    renderDefs(): string {
        return "";
    },

    renderBackground(keySize: KeySize, paints: GraphicStylePaints): string {
        return `<rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="12" fill="${paints.background}" />`;
    },

    renderOverlay(): string {
        return "";
    },
};

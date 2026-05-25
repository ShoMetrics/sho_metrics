import { DEFAULT_PIXEL_WINDOW_PALETTE } from "../../view-rendering/pixel-window-theme-tokens";
import type { KeySize } from "../../view-rendering/widget-data";
import type { ThemeStyle } from "./theme-style";

export const pixelWindowStyle: ThemeStyle = {
    styleId: "pixel-window",

    renderDefs(): string {
        return "";
    },

    renderBackground(keySize: KeySize): string {
        return `<rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            fill="${DEFAULT_PIXEL_WINDOW_PALETTE.clientBackground}" />`;
    },

    renderOverlay(): string {
        return "";
    },
};

import type { KeySize } from "../../rendering/widget-data";
import type { GraphicStyle } from "./style.interface";

const OLD_CRT_RADIUS = 12;

export const oldCrtStyle: GraphicStyle = {
    styleId: "old-crt",

    renderDefs(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <radialGradient id="${idPrefix}-screen" cx="50%" cy="42%" r="76%">
                <stop offset="0%" stop-color="${paints.surface}" stop-opacity="0.9" />
                <stop offset="58%" stop-color="${paints.background}" />
                <stop offset="100%" stop-color="#000000" />
            </radialGradient>
            <linearGradient id="${idPrefix}-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="white" stop-opacity="0.16" />
                <stop offset="36%" stop-color="white" stop-opacity="0" />
                <stop offset="100%" stop-color="${paints.surface}" stop-opacity="0.12" />
            </linearGradient>
            <radialGradient id="${idPrefix}-vignette" cx="50%" cy="45%" r="72%">
                <stop offset="48%" stop-color="#000000" stop-opacity="0" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.64" />
            </radialGradient>
            <pattern id="${idPrefix}-scanlines" width="1" height="3" patternUnits="userSpaceOnUse">
                <rect width="1" height="0.9" fill="${paints.surface}" opacity="0.42" />
                <rect y="1.6" width="1" height="1.1" fill="#000000" opacity="0.38" />
            </pattern>
            <pattern id="${idPrefix}-phosphor-grain" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect x="1" y="0" width="1" height="4" fill="${paints.surface}" opacity="0.08" />
                <rect x="3" y="2" width="1" height="1" fill="${paints.surface}" opacity="0.12" />
            </pattern>
            <pattern id="${idPrefix}-grid" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M12 0 H0 V12" fill="none" stroke="${paints.surface}" stroke-width="0.45" opacity="0.16" />
            </pattern>
        `;
    },

    renderBackground(keySize) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="#000000" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-screen)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-grid)" />
        `;
    },

    renderOverlay(keySize) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-phosphor-grain)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-scanlines)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-glass)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-vignette)" />
        `;
    },
};

function oldCrtIdPrefix(keySize: KeySize): string {
    return `old-crt-${keySize.width}-${keySize.height}`;
}

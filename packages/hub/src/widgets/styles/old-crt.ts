import type { KeySize } from "../../rendering/widget-data";
import type { GraphicStyle } from "./style.interface";

const OLD_CRT_RADIUS = 12;

export const oldCrtStyle: GraphicStyle = {
    styleId: "old-crt",

    renderDefs(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <linearGradient id="${idPrefix}-screen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${paints.background}" />
                <stop offset="45%" stop-color="${paints.surface}" stop-opacity="0.42" />
                <stop offset="100%" stop-color="#000000" />
            </linearGradient>
            <radialGradient id="${idPrefix}-tube-glow" cx="50%" cy="44%" r="86%">
                <stop offset="0%" stop-color="${paints.surface}" stop-opacity="0.32" />
                <stop offset="64%" stop-color="${paints.surface}" stop-opacity="0.08" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.36" />
            </radialGradient>
            <linearGradient id="${idPrefix}-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="white" stop-opacity="0.12" />
                <stop offset="34%" stop-color="white" stop-opacity="0" />
                <stop offset="100%" stop-color="${paints.surface}" stop-opacity="0.08" />
            </linearGradient>
            <radialGradient id="${idPrefix}-curved-glass" cx="50%" cy="32%" r="82%">
                <stop offset="0%" stop-color="white" stop-opacity="0.06" />
                <stop offset="48%" stop-color="white" stop-opacity="0.012" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.16" />
            </radialGradient>
            <radialGradient id="${idPrefix}-vignette" cx="50%" cy="45%" r="72%">
                <stop offset="52%" stop-color="#000000" stop-opacity="0" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.58" />
            </radialGradient>
            <pattern id="${idPrefix}-scanlines" width="1" height="5" patternUnits="userSpaceOnUse">
                <rect width="1" height="3.15" fill="${paints.surface}" opacity="0.12" />
                <rect y="3.55" width="1" height="1.05" fill="#000000" opacity="0.46" />
            </pattern>
            <pattern id="${idPrefix}-phosphor-grain" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect x="1" y="0" width="1" height="4" fill="${paints.surface}" opacity="0.05" />
                <rect x="3" y="2" width="1" height="1" fill="${paints.surface}" opacity="0.08" />
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
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-tube-glow)" />
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
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-curved-glass)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-vignette)" />
        `;
    },
};

function oldCrtIdPrefix(keySize: KeySize): string {
    return `old-crt-${keySize.width}-${keySize.height}`;
}

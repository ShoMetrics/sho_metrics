import type { KeySize } from "../../rendering/widget-data";
import {
    OLD_CRT_LABEL_GLOW_FILTER_ID,
    OLD_CRT_METRIC_GLOW_FILTER_ID,
    OLD_CRT_SUBTLE_GLOW_FILTER_ID,
    OLD_CRT_VALUE_GLOW_FILTER_ID,
} from "../../rendering/render-svg-effects";
import type { GraphicStyle } from "./style.interface";

const OLD_CRT_RADIUS = 12;

export const oldCrtStyle: GraphicStyle = {
    styleId: "old-crt",

    renderDefs(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <linearGradient id="${idPrefix}-screen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${paints.background}" />
                <stop offset="44%" stop-color="${paints.surface}" stop-opacity="0.34" />
                <stop offset="100%" stop-color="#000000" />
            </linearGradient>
            <radialGradient id="${idPrefix}-tube-glow" cx="50%" cy="44%" r="86%">
                <stop offset="0%" stop-color="${paints.surface}" stop-opacity="0.26" />
                <stop offset="58%" stop-color="${paints.surface}" stop-opacity="0.055" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.46" />
            </radialGradient>
            <linearGradient id="${idPrefix}-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="white" stop-opacity="0.12" />
                <stop offset="34%" stop-color="white" stop-opacity="0" />
                <stop offset="100%" stop-color="${paints.surface}" stop-opacity="0.08" />
            </linearGradient>
            <radialGradient id="${idPrefix}-curved-glass" cx="50%" cy="31%" r="80%">
                <stop offset="0%" stop-color="white" stop-opacity="0.072" />
                <stop offset="48%" stop-color="white" stop-opacity="0.012" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.22" />
            </radialGradient>
            <radialGradient id="${idPrefix}-vignette" cx="50%" cy="45%" r="72%">
                <stop offset="49%" stop-color="#000000" stop-opacity="0" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.64" />
            </radialGradient>
            <pattern id="${idPrefix}-scanlines" width="1" height="5" patternUnits="userSpaceOnUse">
                <rect y="3.25" width="1" height="1.2" fill="#000000" opacity="0.52" />
            </pattern>
            <pattern id="${idPrefix}-phosphor-grain" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect x="1" y="0" width="1" height="4" fill="${paints.surface}" opacity="0.035" />
                <rect x="3" y="2" width="1" height="1" fill="${paints.surface}" opacity="0.055" />
            </pattern>
            <pattern id="${idPrefix}-grid" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M12 0 H0 V12" fill="none" stroke="${paints.surface}" stroke-width="0.45" opacity="0.10" />
            </pattern>
            <filter id="${OLD_CRT_VALUE_GLOW_FILTER_ID}" x="-42%" y="-72%" width="184%" height="244%" color-interpolation-filters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.75" result="tightGlow" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.35" result="wideGlow" />
                <feColorMatrix in="wideGlow" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.46 0" result="wideGlowDim" />
                <feMerge>
                    <feMergeNode in="wideGlowDim" />
                    <feMergeNode in="tightGlow" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <filter id="${OLD_CRT_LABEL_GLOW_FILTER_ID}" x="-32%" y="-54%" width="164%" height="208%" color-interpolation-filters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.55" result="tightGlow" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.55" result="wideGlow" />
                <feColorMatrix in="wideGlow" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.34 0" result="wideGlowDim" />
                <feMerge>
                    <feMergeNode in="wideGlowDim" />
                    <feMergeNode in="tightGlow" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <filter id="${OLD_CRT_METRIC_GLOW_FILTER_ID}" x="-30%" y="-42%" width="160%" height="184%" color-interpolation-filters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.05" result="metricGlow" />
                <feColorMatrix in="metricGlow" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.42 0" result="metricGlowDim" />
                <feMerge>
                    <feMergeNode in="metricGlowDim" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <filter id="${OLD_CRT_SUBTLE_GLOW_FILTER_ID}" x="-24%" y="-30%" width="148%" height="160%" color-interpolation-filters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" result="subtleGlow" />
                <feColorMatrix in="subtleGlow" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.22 0" result="subtleGlowDim" />
                <feMerge>
                    <feMergeNode in="subtleGlowDim" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
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

import type { KeySize } from "../../view-rendering/widget-data";
import { renderFullBleedThemeBackground, type ThemeStyle, type ThemeStylePaints } from "./theme-style";

/**
 * Cupertino Glass style: frosted translucent background with specular highlight
 * and subtle border glow. Inspired by modern translucent UI design.
 */
export const cupertinoGlassStyle: ThemeStyle = {
    styleId: "cupertino-glass",

    renderDefs(): string {
        return `
            <!-- Glass: specular sheen gradient -->
            <linearGradient id="glass-sheen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="white" stop-opacity="0.18" />
                <stop offset="40%" stop-color="white" stop-opacity="0.04" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
            </linearGradient>
            <!-- Glass: border gradient -->
            <linearGradient id="glass-border" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="white" stop-opacity="0.3" />
                <stop offset="100%" stop-color="white" stop-opacity="0.05" />
            </linearGradient>
            <!-- Glass: inner glow filter -->
            <filter id="glass-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur" />
                <feFlood flood-color="white" flood-opacity="0.04" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        `;
    },

    renderBackground(keySize: KeySize, paints: ThemeStylePaints): string {
        const inset = 2;
        const radius = 18;
        return `
            ${renderFullBleedThemeBackground(keySize, paints)}
            <!-- Glass: frosted background -->
            <rect x="${inset}" y="${inset}"
                width="${keySize.width - inset * 2}" height="${keySize.height - inset * 2}"
                rx="${radius}" fill="${paints.surface}"
                stroke="url(#glass-border)" stroke-width="1" />
        `;
    },

    renderOverlay(keySize: KeySize): string {
        const inset = 2;
        const radius = 18;
        const sheenHeight = keySize.height * 0.45;
        return `
            <!-- Glass: specular highlight overlay -->
            <rect x="${inset}" y="${inset}"
                width="${keySize.width - inset * 2}" height="${sheenHeight}"
                rx="${radius}" fill="url(#glass-sheen)" />
        `;
    },
};

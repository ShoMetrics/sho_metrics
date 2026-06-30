import type { KeySize } from "../../view-rendering/widget-data";
import {
    TERMINAL_LABEL_GLOW_FILTER_ID,
    TERMINAL_METRIC_GLOW_FILTER_ID,
    TERMINAL_SUBTLE_GLOW_FILTER_ID,
    TERMINAL_VALUE_GLOW_FILTER_ID,
} from "../../view-rendering/rasterize/render-svg-effects";
import { renderFullBleedThemeBackground, type ThemeStyle, type ThemeStylePaints } from "./theme-style";

const TERMINAL_RADIUS = 12;
const TERMINAL_REFERENCE_SIZE = 144;
const CLEAN_TERMINAL_SCREEN_WASH_OPACITY = 0.026;
const CLEAN_TERMINAL_SCANLINE_PERIOD = 6;
const CLEAN_TERMINAL_SCANLINE_DARK_BAND_HEIGHT = 1;
const CLEAN_TERMINAL_SCANLINE_DARK_BAND_OPACITY = 0.055;
const CLEAN_TERMINAL_SIDE_EDGE_SHADE_OPACITY = 0.20;
const CLEAN_TERMINAL_VERTICAL_SHADE_OPACITY = 0.22;
const TERMINAL_SCREEN_WASH_OPACITY = 0.049;
const TERMINAL_SCANLINE_PERIOD = 5.2;
const TERMINAL_SCANLINE_DARK_BAND_HEIGHT = 1.15;
const TERMINAL_SCANLINE_DARK_BAND_OPACITY = 0.17;
const TERMINAL_PHOSPHOR_GRAIN_OPACITY = 0.006;
const TERMINAL_REFLECTION_X = 98;
const TERMINAL_REFLECTION_Y = 50;
const TERMINAL_REFLECTION_WIDTH = 95;
const TERMINAL_REFLECTION_HEIGHT = 40;
const TERMINAL_REFLECTION_SPREAD = 2.4;
const TERMINAL_REFLECTION_OPACITY = 0.37;
const TERMINAL_REFLECTION_HALO_OPACITY = 0.25;
const TERMINAL_REFLECTION_BLUR = 8;
const TERMINAL_REFLECTION_CORE_X = 101;
const TERMINAL_REFLECTION_CORE_Y = 39;
const TERMINAL_REFLECTION_CORE_WIDTH = 53;
const TERMINAL_REFLECTION_CORE_HEIGHT = 24;
const TERMINAL_REFLECTION_CORE_SPREAD = 2.25;
const TERMINAL_REFLECTION_CORE_OPACITY = 0.22;
const TERMINAL_REFLECTION_CORE_BLUR = 3.5;
const TERMINAL_SATELLITE_REFLECTION_X = 46;
const TERMINAL_SATELLITE_REFLECTION_Y = 30;
const TERMINAL_SATELLITE_REFLECTION_WIDTH = 44;
const TERMINAL_SATELLITE_REFLECTION_HEIGHT = 18;
const TERMINAL_SATELLITE_REFLECTION_SPREAD = 1.75;
const TERMINAL_SATELLITE_REFLECTION_OPACITY = 0.12;
const TERMINAL_SATELLITE_REFLECTION_BLUR = 8;
const TERMINAL_SATELLITE_REFLECTION_IRREGULARITY = 0.5;
const TERMINAL_SCREEN_CONVEXITY = 0.15;
const TERMINAL_CONVEX_DISPLACEMENT_SCALE = 18 * TERMINAL_SCREEN_CONVEXITY;
const TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE = 48;
const TERMINAL_CONVEX_DISPLACEMENT_MAP_BLUR = 0.7;
const TERMINAL_CONVEX_DISPLACEMENT_MAP_URI = buildTerminalConvexDisplacementMapUri();
const TERMINAL_TOP_RIM_OPACITY = 0.19;
const TERMINAL_TOP_RIM_Y = 23;
const TERMINAL_TOP_RIM_HEIGHT = 8;
const TERMINAL_TOP_RIM_CURVE = 9;
const TERMINAL_TOP_RIM_BLUR = 6;
const TERMINAL_SIDE_EDGE_SHADE_OPACITY = 0.62;
const TERMINAL_VERTICAL_SHADE_OPACITY = 0.70;
const TERMINAL_CURVED_GLASS_CENTER_OPACITY = 0.022;
const TERMINAL_CURVED_GLASS_EDGE_OPACITY = 0.26;
const TERMINAL_WIDE_GLASS_CENTER_OPACITY = 0.055;
const TERMINAL_WIDE_GLASS_EDGE_OPACITY = 0.20;

interface TerminalGlowSettings {
    readonly valueTightBlur: number;
    readonly valueWideBlur: number;
    readonly valueWideOpacity: number;
    readonly labelTightBlur: number;
    readonly labelWideBlur: number;
    readonly labelWideOpacity: number;
    readonly metricBlur: number;
    readonly metricOpacity: number;
    readonly subtleBlur: number;
    readonly subtleOpacity: number;
}

interface TerminalRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

const CLEAN_TERMINAL_GLOW_SETTINGS = {
    valueTightBlur: 0.34,
    valueWideBlur: 1.15,
    valueWideOpacity: 0.24,
    labelTightBlur: 0.24,
    labelWideBlur: 0.72,
    labelWideOpacity: 0.16,
    metricBlur: 0.62,
    metricOpacity: 0.22,
    subtleBlur: 0.28,
    subtleOpacity: 0.16,
} satisfies TerminalGlowSettings;

const VINTAGE_TERMINAL_GLOW_SETTINGS = {
    valueTightBlur: 0.75,
    valueWideBlur: 2.35,
    valueWideOpacity: 0.46,
    labelTightBlur: 0.55,
    labelWideBlur: 1.55,
    labelWideOpacity: 0.34,
    metricBlur: 1.05,
    metricOpacity: 0.42,
    subtleBlur: 0.45,
    subtleOpacity: 0.22,
} satisfies TerminalGlowSettings;

export const terminalCleanStyle: ThemeStyle = {
    styleId: "terminal-clean",

    renderDefs(keySize, paints) {
        const idPrefix = terminalIdPrefix(keySize);

        return [
            renderCleanTerminalScreenGradients(idPrefix, paints),
            renderCleanTerminalRasterPatterns(idPrefix),
            renderTerminalGlowFilters(CLEAN_TERMINAL_GLOW_SETTINGS),
        ].join("");
    },

    renderBackground(keySize, paints) {
        return renderTerminalBackground(keySize, paints);
    },

    renderPanelOverlay(keySize) {
        const idPrefix = terminalIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-scanlines)" />
        `;
    },

    renderOverlay(keySize) {
        return renderCleanTerminalFrameShadeOverlay(keySize, terminalIdPrefix(keySize));
    },
};

export const terminalVintageStyle: ThemeStyle = {
    styleId: "terminal-vintage",

    renderDefs(keySize, paints) {
        const idPrefix = terminalIdPrefix(keySize);

        return [
            renderTerminalScreenGradients(idPrefix, paints),
            renderTerminalReflectionGradients(idPrefix, paints),
            renderTerminalGlassGradients(idPrefix, paints),
            renderTerminalRasterPatterns(idPrefix, paints),
            renderTerminalReflectionBlurFilters(idPrefix, keySize),
            renderTerminalScreenDisplacementFilter(idPrefix, keySize),
            renderTerminalGlowFilters(VINTAGE_TERMINAL_GLOW_SETTINGS),
        ].join("");
    },

    renderBackground(keySize, paints) {
        return renderTerminalBackground(keySize, paints);
    },

    renderPanelAttributes(keySize) {
        if (!shouldRenderTerminalScreenDisplacement(keySize)) {
            return [];
        }

        return [`filter="url(#${terminalIdPrefix(keySize)}-screen-displacement)"`];
    },

    renderPanelOverlay(keySize) {
        const idPrefix = terminalIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-phosphor-grain)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-scanlines)" />
        `;
    },

    renderOverlay(keySize, paints) {
        const idPrefix = terminalIdPrefix(keySize);

        return [
            renderTerminalReflectionOverlay(keySize, paints, idPrefix),
            renderTerminalGlassOverlay(keySize, idPrefix),
            renderTerminalFrameShadeOverlay(keySize, idPrefix),
        ].join("");
    },
};

function renderTerminalBackground(keySize: KeySize, paints: ThemeStylePaints): string {
    const idPrefix = terminalIdPrefix(keySize);

    return `
        ${renderFullBleedThemeBackground(keySize, paints)}
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="#000000" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="${paints.background}" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-screen-wash)" />
    `;
}

function renderCleanTerminalScreenGradients(idPrefix: string, paints: ThemeStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-screen-wash" cx="52%" cy="43%" r="82%">
            <stop offset="0%" stop-color="${paints.surface}" stop-opacity="${CLEAN_TERMINAL_SCREEN_WASH_OPACITY}" />
            <stop offset="62%" stop-color="${paints.surface}" stop-opacity="${CLEAN_TERMINAL_SCREEN_WASH_OPACITY * 0.22}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="${idPrefix}-vertical-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_VERTICAL_SHADE_OPACITY}" />
            <stop offset="18%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_VERTICAL_SHADE_OPACITY * 0.12}" />
            <stop offset="50%" stop-color="#000000" stop-opacity="0" />
            <stop offset="88%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_VERTICAL_SHADE_OPACITY * 0.10}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_VERTICAL_SHADE_OPACITY}" />
        </linearGradient>
        <linearGradient id="${idPrefix}-edge-shade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_SIDE_EDGE_SHADE_OPACITY}" />
            <stop offset="16%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_SIDE_EDGE_SHADE_OPACITY * 0.18}" />
            <stop offset="48%" stop-color="#000000" stop-opacity="0" />
            <stop offset="84%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_SIDE_EDGE_SHADE_OPACITY * 0.18}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${CLEAN_TERMINAL_SIDE_EDGE_SHADE_OPACITY}" />
        </linearGradient>
    `;
}

function renderTerminalScreenGradients(idPrefix: string, paints: ThemeStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-screen-wash" cx="52%" cy="43%" r="78%">
            <stop offset="0%" stop-color="${paints.surface}" stop-opacity="${TERMINAL_SCREEN_WASH_OPACITY}" />
            <stop offset="58%" stop-color="${paints.surface}" stop-opacity="${TERMINAL_SCREEN_WASH_OPACITY * 0.28}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="${idPrefix}-vertical-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#000000" stop-opacity="${TERMINAL_VERTICAL_SHADE_OPACITY * 0.72}" />
            <stop offset="14%" stop-color="#000000" stop-opacity="${TERMINAL_VERTICAL_SHADE_OPACITY * 0.18}" />
            <stop offset="42%" stop-color="#000000" stop-opacity="0" />
            <stop offset="62%" stop-color="#000000" stop-opacity="0" />
            <stop offset="88%" stop-color="#000000" stop-opacity="${TERMINAL_VERTICAL_SHADE_OPACITY * 0.20}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${TERMINAL_VERTICAL_SHADE_OPACITY}" />
        </linearGradient>
        <linearGradient id="${idPrefix}-edge-shade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#000000" stop-opacity="${TERMINAL_SIDE_EDGE_SHADE_OPACITY}" />
            <stop offset="14%" stop-color="#000000" stop-opacity="${TERMINAL_SIDE_EDGE_SHADE_OPACITY * 0.34}" />
            <stop offset="39%" stop-color="#000000" stop-opacity="0" />
            <stop offset="61%" stop-color="#000000" stop-opacity="0" />
            <stop offset="86%" stop-color="#000000" stop-opacity="${TERMINAL_SIDE_EDGE_SHADE_OPACITY * 0.34}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${TERMINAL_SIDE_EDGE_SHADE_OPACITY}" />
        </linearGradient>
    `;
}

function renderTerminalReflectionGradients(idPrefix: string, paints: ThemeStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-main-reflection" cx="48%" cy="42%" r="70%">
            <stop offset="0%" stop-color="white" stop-opacity="0.26" />
            <stop offset="32%" stop-color="${paints.surface}" stop-opacity="0.36" />
            <stop offset="60%" stop-color="${paints.surface}" stop-opacity="0.10" />
            <stop offset="100%" stop-color="${paints.surface}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="${idPrefix}-core-reflection" cx="50%" cy="48%" r="64%">
            <stop offset="0%" stop-color="white" stop-opacity="0.34" />
            <stop offset="46%" stop-color="${paints.surface}" stop-opacity="0.34" />
            <stop offset="100%" stop-color="${paints.surface}" stop-opacity="0" />
        </radialGradient>
    `;
}

function renderTerminalGlassGradients(idPrefix: string, paints: ThemeStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-curved-glass" cx="50%" cy="48%" r="112%">
            <stop offset="0%" stop-color="white" stop-opacity="${TERMINAL_CURVED_GLASS_CENTER_OPACITY}" />
            <stop offset="72%" stop-color="white" stop-opacity="${TERMINAL_CURVED_GLASS_CENTER_OPACITY * 0.22}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${TERMINAL_CURVED_GLASS_EDGE_OPACITY}" />
        </radialGradient>
        <radialGradient id="${idPrefix}-wide-curved-glass" cx="50%" cy="44%" r="76%">
            <stop offset="0%" stop-color="white" stop-opacity="${TERMINAL_WIDE_GLASS_CENTER_OPACITY}" />
            <stop offset="46%" stop-color="${paints.surface}" stop-opacity="${TERMINAL_WIDE_GLASS_CENTER_OPACITY * 0.64}" />
            <stop offset="82%" stop-color="#000000" stop-opacity="0" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${TERMINAL_WIDE_GLASS_EDGE_OPACITY}" />
        </radialGradient>
    `;
}

function renderTerminalRasterPatterns(idPrefix: string, paints: ThemeStylePaints): string {
    return `
        <pattern id="${idPrefix}-scanlines" width="1" height="${TERMINAL_SCANLINE_PERIOD}" patternUnits="userSpaceOnUse">
            <rect y="${TERMINAL_SCANLINE_PERIOD - TERMINAL_SCANLINE_DARK_BAND_HEIGHT - 0.45}"
                width="1" height="${TERMINAL_SCANLINE_DARK_BAND_HEIGHT}"
                fill="#000000" opacity="${TERMINAL_SCANLINE_DARK_BAND_OPACITY}" />
        </pattern>
        <pattern id="${idPrefix}-phosphor-grain" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect x="1" y="0" width="1" height="4" fill="${paints.surface}" opacity="${TERMINAL_PHOSPHOR_GRAIN_OPACITY}" />
            <rect x="3" y="2" width="1" height="1" fill="${paints.surface}" opacity="${TERMINAL_PHOSPHOR_GRAIN_OPACITY}" />
        </pattern>
    `;
}

function renderCleanTerminalRasterPatterns(idPrefix: string): string {
    return `
        <pattern id="${idPrefix}-scanlines" width="1" height="${CLEAN_TERMINAL_SCANLINE_PERIOD}" patternUnits="userSpaceOnUse">
            <rect y="${CLEAN_TERMINAL_SCANLINE_PERIOD - CLEAN_TERMINAL_SCANLINE_DARK_BAND_HEIGHT}"
                width="1" height="${CLEAN_TERMINAL_SCANLINE_DARK_BAND_HEIGHT}"
                fill="#000000" opacity="${CLEAN_TERMINAL_SCANLINE_DARK_BAND_OPACITY}" />
        </pattern>
    `;
}

function renderTerminalReflectionBlurFilters(idPrefix: string, keySize: KeySize): string {
    return [
        renderTerminalBlurFilter(`${idPrefix}-main-reflection-blur`, keySize, TERMINAL_REFLECTION_BLUR),
        renderTerminalBlurFilter(`${idPrefix}-core-reflection-blur`, keySize, TERMINAL_REFLECTION_CORE_BLUR),
        renderTerminalBlurFilter(`${idPrefix}-satellite-reflection-blur`, keySize, TERMINAL_SATELLITE_REFLECTION_BLUR),
        renderTerminalBlurFilter(`${idPrefix}-rim-blur`, keySize, TERMINAL_TOP_RIM_BLUR),
    ].join("");
}

function renderTerminalGlowFilters(glow: TerminalGlowSettings): string {
    return `
        <filter id="${TERMINAL_VALUE_GLOW_FILTER_ID}" x="-42%" y="-72%" width="184%" height="244%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.valueTightBlur}" result="tightGlow" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.valueWideBlur}" result="wideGlow" />
            <feColorMatrix in="wideGlow" type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glow.valueWideOpacity} 0" result="wideGlowDim" />
            <feMerge>
                <feMergeNode in="wideGlowDim" />
                <feMergeNode in="tightGlow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
        <filter id="${TERMINAL_LABEL_GLOW_FILTER_ID}" x="-32%" y="-54%" width="164%" height="208%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.labelTightBlur}" result="tightGlow" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.labelWideBlur}" result="wideGlow" />
            <feColorMatrix in="wideGlow" type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glow.labelWideOpacity} 0" result="wideGlowDim" />
            <feMerge>
                <feMergeNode in="wideGlowDim" />
                <feMergeNode in="tightGlow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
        <filter id="${TERMINAL_METRIC_GLOW_FILTER_ID}" x="-30%" y="-42%" width="160%" height="184%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.metricBlur}" result="metricGlow" />
            <feColorMatrix in="metricGlow" type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glow.metricOpacity} 0" result="metricGlowDim" />
            <feMerge>
                <feMergeNode in="metricGlowDim" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
        <filter id="${TERMINAL_SUBTLE_GLOW_FILTER_ID}" x="-24%" y="-30%" width="148%" height="160%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${glow.subtleBlur}" result="subtleGlow" />
            <feColorMatrix in="subtleGlow" type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glow.subtleOpacity} 0" result="subtleGlowDim" />
            <feMerge>
                <feMergeNode in="subtleGlowDim" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    `;
}

function renderTerminalReflectionOverlay(keySize: KeySize, paints: ThemeStylePaints, idPrefix: string): string {
    const reflection = scaleTerminalRect(keySize, {
        x: TERMINAL_REFLECTION_X,
        y: TERMINAL_REFLECTION_Y,
        width: TERMINAL_REFLECTION_WIDTH,
        height: TERMINAL_REFLECTION_HEIGHT,
    });
    const secondaryReflection = scaleTerminalRect(keySize, {
        x: TERMINAL_SATELLITE_REFLECTION_X + (TERMINAL_SATELLITE_REFLECTION_IRREGULARITY - 0.5) * 18,
        y: TERMINAL_SATELLITE_REFLECTION_Y + Math.sin(TERMINAL_SATELLITE_REFLECTION_IRREGULARITY * Math.PI) * 6,
        width: TERMINAL_SATELLITE_REFLECTION_WIDTH,
        height: TERMINAL_SATELLITE_REFLECTION_HEIGHT,
    });
    const reflectionCore = scaleTerminalRect(keySize, {
        x: TERMINAL_REFLECTION_CORE_X,
        y: TERMINAL_REFLECTION_CORE_Y,
        width: TERMINAL_REFLECTION_CORE_WIDTH,
        height: TERMINAL_REFLECTION_CORE_HEIGHT,
    });
    const topReflectionPath = buildScaledTopReflectionPath(keySize);

    return `
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width * TERMINAL_REFLECTION_SPREAD / 2}"
                ry="${reflection.height * TERMINAL_REFLECTION_SPREAD / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${TERMINAL_REFLECTION_HALO_OPACITY}" />
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width * (1 + (TERMINAL_REFLECTION_SPREAD - 1) * 0.45) / 2}"
                ry="${reflection.height * (1 + (TERMINAL_REFLECTION_SPREAD - 1) * 0.45) / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${TERMINAL_REFLECTION_OPACITY * 0.48}"
                filter="url(#${idPrefix}-main-reflection-blur)" />
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width / 2}" ry="${reflection.height / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${TERMINAL_REFLECTION_OPACITY}"
                filter="url(#${idPrefix}-main-reflection-blur)" />
            <ellipse cx="${reflectionCore.x}" cy="${reflectionCore.y}"
                rx="${reflectionCore.width * TERMINAL_REFLECTION_CORE_SPREAD / 2}"
                ry="${reflectionCore.height * TERMINAL_REFLECTION_CORE_SPREAD / 2}"
                fill="url(#${idPrefix}-core-reflection)" opacity="${TERMINAL_REFLECTION_CORE_OPACITY * 0.42}" />
            <ellipse cx="${reflectionCore.x}" cy="${reflectionCore.y}"
                rx="${reflectionCore.width / 2}" ry="${reflectionCore.height / 2}"
                fill="url(#${idPrefix}-core-reflection)" opacity="${TERMINAL_REFLECTION_CORE_OPACITY}"
                filter="url(#${idPrefix}-core-reflection-blur)" />
            <ellipse cx="${secondaryReflection.x}" cy="${secondaryReflection.y}"
                rx="${secondaryReflection.width * TERMINAL_SATELLITE_REFLECTION_SPREAD / 2}"
                ry="${secondaryReflection.height * TERMINAL_SATELLITE_REFLECTION_SPREAD / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${TERMINAL_SATELLITE_REFLECTION_OPACITY * 0.48}" />
            <ellipse cx="${secondaryReflection.x}" cy="${secondaryReflection.y}"
                rx="${secondaryReflection.width / 2}" ry="${secondaryReflection.height / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${TERMINAL_SATELLITE_REFLECTION_OPACITY}"
                filter="url(#${idPrefix}-satellite-reflection-blur)" />
            <path d="${topReflectionPath}" fill="${paints.surface}"
                opacity="${TERMINAL_TOP_RIM_OPACITY}" filter="url(#${idPrefix}-rim-blur)" />
    `;
}

function renderTerminalGlassOverlay(keySize: KeySize, idPrefix: string): string {
    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-curved-glass)" />
        ${renderWideTerminalConvexGlass(keySize, idPrefix)}
    `;
}

function renderTerminalFrameShadeOverlay(keySize: KeySize, idPrefix: string): string {
    return renderTerminalFrameShade(keySize, idPrefix, 0.52);
}

function renderCleanTerminalFrameShadeOverlay(keySize: KeySize, idPrefix: string): string {
    return renderTerminalFrameShade(keySize, idPrefix, 0.34);
}

function renderTerminalFrameShade(keySize: KeySize, idPrefix: string, strokeOpacity: number): string {
    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-edge-shade)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-vertical-shade)" />
        <rect x="1.5" y="1.5" width="${keySize.width - 3}" height="${keySize.height - 3}"
            rx="${TERMINAL_RADIUS - 1.5}" fill="none" stroke="#000000"
            stroke-opacity="${strokeOpacity}" stroke-width="3" />
    `;
}

function terminalIdPrefix(keySize: KeySize): string {
    return `terminal-${keySize.width}-${keySize.height}`;
}

function scaleTerminalX(keySize: KeySize, value: number): number {
    return value * keySize.width / TERMINAL_REFERENCE_SIZE;
}

function scaleTerminalY(keySize: KeySize, value: number): number {
    return value * keySize.height / TERMINAL_REFERENCE_SIZE;
}

function scaleTerminalLength(keySize: KeySize, value: number): number {
    return value * Math.min(keySize.width, keySize.height) / TERMINAL_REFERENCE_SIZE;
}

function scaleTerminalRect(
    keySize: KeySize,
    rect: TerminalRect,
): TerminalRect {
    return {
        x: scaleTerminalX(keySize, rect.x),
        y: scaleTerminalY(keySize, rect.y),
        width: scaleTerminalX(keySize, rect.width),
        height: scaleTerminalY(keySize, rect.height),
    };
}

function buildScaledTopReflectionPath(keySize: KeySize): string {
    const startX = scaleTerminalX(keySize, 8);
    const startY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y);
    const firstControlX = scaleTerminalX(keySize, 32);
    const firstControlY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y - TERMINAL_TOP_RIM_CURVE);
    const secondControlX = scaleTerminalX(keySize, 78);
    const secondControlY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y - TERMINAL_TOP_RIM_CURVE * 0.95);
    const firstEndX = scaleTerminalX(keySize, 136);
    const firstEndY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y - 2);
    const lineEndY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y + TERMINAL_TOP_RIM_HEIGHT);
    const thirdControlX = scaleTerminalX(keySize, 88);
    const thirdControlY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y + TERMINAL_TOP_RIM_HEIGHT - TERMINAL_TOP_RIM_CURVE * 0.70);
    const fourthControlX = scaleTerminalX(keySize, 38);
    const fourthControlY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y + TERMINAL_TOP_RIM_HEIGHT - TERMINAL_TOP_RIM_CURVE * 0.55);
    const secondEndY = scaleTerminalY(keySize, TERMINAL_TOP_RIM_Y + TERMINAL_TOP_RIM_HEIGHT + 2);

    return [
        `M ${formatSvgNumber(startX)} ${formatSvgNumber(startY)}`,
        `C ${formatSvgNumber(firstControlX)} ${formatSvgNumber(firstControlY)}`,
        `${formatSvgNumber(secondControlX)} ${formatSvgNumber(secondControlY)}`,
        `${formatSvgNumber(firstEndX)} ${formatSvgNumber(firstEndY)}`,
        `L ${formatSvgNumber(firstEndX)} ${formatSvgNumber(lineEndY)}`,
        `C ${formatSvgNumber(thirdControlX)} ${formatSvgNumber(thirdControlY)}`,
        `${formatSvgNumber(fourthControlX)} ${formatSvgNumber(fourthControlY)}`,
        `${formatSvgNumber(startX)} ${formatSvgNumber(secondEndY)}`,
        "Z",
    ].join(" ");
}

function renderTerminalBlurFilter(id: string, keySize: KeySize, blur: number): string {
    return `
        <filter id="${id}" filterUnits="userSpaceOnUse"
            x="-${keySize.width}" y="-${keySize.height}" width="${keySize.width * 3}" height="${keySize.height * 3}">
            <feGaussianBlur stdDeviation="${formatSvgNumber(scaleTerminalLength(keySize, blur))}" />
        </filter>
    `;
}

function renderTerminalScreenDisplacementFilter(idPrefix: string, keySize: KeySize): string {
    if (!shouldRenderTerminalScreenDisplacement(keySize)) {
        return "";
    }

    return `
        <filter id="${idPrefix}-screen-displacement" filterUnits="userSpaceOnUse"
            x="-12" y="-12" width="${keySize.width + 24}" height="${keySize.height + 24}"
            color-interpolation-filters="sRGB">
            <feImage href="${TERMINAL_CONVEX_DISPLACEMENT_MAP_URI}" x="0" y="0"
                width="${keySize.width}" height="${keySize.height}" preserveAspectRatio="none" result="convexMap" />
            <feGaussianBlur in="convexMap"
                stdDeviation="${scaleTerminalLength(keySize, TERMINAL_CONVEX_DISPLACEMENT_MAP_BLUR)}"
                result="smoothConvexMap" />
            <feDisplacementMap in="SourceGraphic" in2="smoothConvexMap"
                scale="${scaleTerminalLength(keySize, TERMINAL_CONVEX_DISPLACEMENT_SCALE)}"
                xChannelSelector="R" yChannelSelector="G" />
        </filter>
    `;
}

function renderWideTerminalConvexGlass(keySize: KeySize, idPrefix: string): string {
    if (shouldRenderTerminalScreenDisplacement(keySize)) {
        return "";
    }

    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${TERMINAL_RADIUS}" fill="url(#${idPrefix}-wide-curved-glass)" />
    `;
}

function shouldRenderTerminalScreenDisplacement(keySize: KeySize): boolean {
    return keySize.width === keySize.height;
}

function buildTerminalConvexDisplacementMapUri(): string {
    const rects: string[] = [];

    for (let yCoordinate = 0; yCoordinate < TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE; yCoordinate += 1) {
        for (let xCoordinate = 0; xCoordinate < TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE; xCoordinate += 1) {
            const normalizedX = ((xCoordinate + 0.5) / TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE - 0.5) * 2;
            const normalizedY = ((yCoordinate + 0.5) / TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE - 0.5) * 2;
            const distance = Math.min(1, Math.hypot(normalizedX, normalizedY));
            const radialStrength = distance ** 1.72;
            const redChannel = clampColorChannel(128 + normalizedX * radialStrength * 127);
            const greenChannel = clampColorChannel(128 + normalizedY * radialStrength * 127);

            rects.push(
                `<rect x="${xCoordinate}" y="${yCoordinate}" width="1" height="1" fill="rgb(${redChannel} ${greenChannel} 128)" />`,
            );
        }
    }

    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE}"`,
        ` height="${TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE}" viewBox="0 0`,
        ` ${TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE} ${TERMINAL_CONVEX_DISPLACEMENT_MAP_SIZE}">`,
        rects.join(""),
        "</svg>",
    ].join("");

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function clampColorChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function formatSvgNumber(value: number): string {
    return Number(value.toFixed(2)).toString();
}

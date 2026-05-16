import type { KeySize } from "../../rendering/widget-data";
import {
    OLD_CRT_LABEL_GLOW_FILTER_ID,
    OLD_CRT_METRIC_GLOW_FILTER_ID,
    OLD_CRT_SUBTLE_GLOW_FILTER_ID,
    OLD_CRT_VALUE_GLOW_FILTER_ID,
} from "../../rendering/render-svg-effects";
import type { GraphicStyle, GraphicStylePaints } from "./style.interface";

const OLD_CRT_RADIUS = 12;
const OLD_CRT_REFERENCE_SIZE = 144;
const OLD_CRT_SCREEN_WASH_OPACITY = 0.049;
const OLD_CRT_SCANLINE_PERIOD = 5.2;
const OLD_CRT_SCANLINE_DARK_BAND_HEIGHT = 1.15;
const OLD_CRT_SCANLINE_DARK_BAND_OPACITY = 0.17;
const OLD_CRT_PHOSPHOR_GRAIN_OPACITY = 0.006;
const OLD_CRT_REFLECTION_X = 98;
const OLD_CRT_REFLECTION_Y = 50;
const OLD_CRT_REFLECTION_WIDTH = 95;
const OLD_CRT_REFLECTION_HEIGHT = 40;
const OLD_CRT_REFLECTION_SPREAD = 2.4;
const OLD_CRT_REFLECTION_OPACITY = 0.37;
const OLD_CRT_REFLECTION_HALO_OPACITY = 0.25;
const OLD_CRT_REFLECTION_BLUR = 8;
const OLD_CRT_REFLECTION_CORE_X = 101;
const OLD_CRT_REFLECTION_CORE_Y = 39;
const OLD_CRT_REFLECTION_CORE_WIDTH = 53;
const OLD_CRT_REFLECTION_CORE_HEIGHT = 24;
const OLD_CRT_REFLECTION_CORE_SPREAD = 2.25;
const OLD_CRT_REFLECTION_CORE_OPACITY = 0.22;
const OLD_CRT_REFLECTION_CORE_BLUR = 3.5;
const OLD_CRT_SATELLITE_REFLECTION_X = 46;
const OLD_CRT_SATELLITE_REFLECTION_Y = 30;
const OLD_CRT_SATELLITE_REFLECTION_WIDTH = 44;
const OLD_CRT_SATELLITE_REFLECTION_HEIGHT = 18;
const OLD_CRT_SATELLITE_REFLECTION_SPREAD = 1.75;
const OLD_CRT_SATELLITE_REFLECTION_OPACITY = 0.12;
const OLD_CRT_SATELLITE_REFLECTION_BLUR = 8;
const OLD_CRT_SATELLITE_REFLECTION_IRREGULARITY = 0.5;
const OLD_CRT_SCREEN_CONVEXITY = 0.15;
const OLD_CRT_CONVEX_DISPLACEMENT_SCALE = 18 * OLD_CRT_SCREEN_CONVEXITY;
const OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE = 48;
const OLD_CRT_CONVEX_DISPLACEMENT_MAP_BLUR = 0.7;
const OLD_CRT_CONVEX_DISPLACEMENT_MAP_URI = buildOldCrtConvexDisplacementMapUri();
const OLD_CRT_TOP_RIM_OPACITY = 0.19;
const OLD_CRT_TOP_RIM_Y = 23;
const OLD_CRT_TOP_RIM_HEIGHT = 8;
const OLD_CRT_TOP_RIM_CURVE = 9;
const OLD_CRT_TOP_RIM_BLUR = 6;
const OLD_CRT_SIDE_EDGE_SHADE_OPACITY = 0.62;
const OLD_CRT_VERTICAL_SHADE_OPACITY = 0.70;
const OLD_CRT_CURVED_GLASS_CENTER_OPACITY = 0.022;
const OLD_CRT_CURVED_GLASS_EDGE_OPACITY = 0.26;
const OLD_CRT_WIDE_GLASS_CENTER_OPACITY = 0.055;
const OLD_CRT_WIDE_GLASS_EDGE_OPACITY = 0.20;

export const oldCrtStyle: GraphicStyle = {
    styleId: "old-crt",

    renderDefs(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return [
            renderOldCrtScreenGradients(idPrefix, paints),
            renderOldCrtReflectionGradients(idPrefix, paints),
            renderOldCrtGlassGradients(idPrefix, paints),
            renderOldCrtRasterPatterns(idPrefix, paints),
            renderOldCrtReflectionBlurFilters(idPrefix, keySize),
            renderOldCrtScreenDisplacementFilter(idPrefix, keySize),
            renderOldCrtGlowFilters(),
        ].join("");
    },

    renderBackground(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="#000000" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="${paints.background}" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-screen-wash)" />
        `;
    },

    renderPanelAttributes(keySize) {
        if (!shouldRenderOldCrtScreenDisplacement(keySize)) {
            return [];
        }

        return [`filter="url(#${oldCrtIdPrefix(keySize)}-screen-displacement)"`];
    },

    renderPanelOverlay(keySize) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-phosphor-grain)" />
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-scanlines)" />
        `;
    },

    renderOverlay(keySize, paints) {
        const idPrefix = oldCrtIdPrefix(keySize);

        return [
            renderOldCrtReflectionOverlay(keySize, paints, idPrefix),
            renderOldCrtGlassOverlay(keySize, idPrefix),
            renderOldCrtFrameShadeOverlay(keySize, idPrefix),
        ].join("");
    },
};

function renderOldCrtScreenGradients(idPrefix: string, paints: GraphicStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-screen-wash" cx="52%" cy="43%" r="78%">
            <stop offset="0%" stop-color="${paints.surface}" stop-opacity="${OLD_CRT_SCREEN_WASH_OPACITY}" />
            <stop offset="58%" stop-color="${paints.surface}" stop-opacity="${OLD_CRT_SCREEN_WASH_OPACITY * 0.28}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="${idPrefix}-vertical-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#000000" stop-opacity="${OLD_CRT_VERTICAL_SHADE_OPACITY * 0.72}" />
            <stop offset="14%" stop-color="#000000" stop-opacity="${OLD_CRT_VERTICAL_SHADE_OPACITY * 0.18}" />
            <stop offset="42%" stop-color="#000000" stop-opacity="0" />
            <stop offset="62%" stop-color="#000000" stop-opacity="0" />
            <stop offset="88%" stop-color="#000000" stop-opacity="${OLD_CRT_VERTICAL_SHADE_OPACITY * 0.20}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${OLD_CRT_VERTICAL_SHADE_OPACITY}" />
        </linearGradient>
        <linearGradient id="${idPrefix}-edge-shade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#000000" stop-opacity="${OLD_CRT_SIDE_EDGE_SHADE_OPACITY}" />
            <stop offset="14%" stop-color="#000000" stop-opacity="${OLD_CRT_SIDE_EDGE_SHADE_OPACITY * 0.34}" />
            <stop offset="39%" stop-color="#000000" stop-opacity="0" />
            <stop offset="61%" stop-color="#000000" stop-opacity="0" />
            <stop offset="86%" stop-color="#000000" stop-opacity="${OLD_CRT_SIDE_EDGE_SHADE_OPACITY * 0.34}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${OLD_CRT_SIDE_EDGE_SHADE_OPACITY}" />
        </linearGradient>
    `;
}

function renderOldCrtReflectionGradients(idPrefix: string, paints: GraphicStylePaints): string {
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

function renderOldCrtGlassGradients(idPrefix: string, paints: GraphicStylePaints): string {
    return `
        <radialGradient id="${idPrefix}-curved-glass" cx="50%" cy="48%" r="112%">
            <stop offset="0%" stop-color="white" stop-opacity="${OLD_CRT_CURVED_GLASS_CENTER_OPACITY}" />
            <stop offset="72%" stop-color="white" stop-opacity="${OLD_CRT_CURVED_GLASS_CENTER_OPACITY * 0.22}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${OLD_CRT_CURVED_GLASS_EDGE_OPACITY}" />
        </radialGradient>
        <radialGradient id="${idPrefix}-wide-curved-glass" cx="50%" cy="44%" r="76%">
            <stop offset="0%" stop-color="white" stop-opacity="${OLD_CRT_WIDE_GLASS_CENTER_OPACITY}" />
            <stop offset="46%" stop-color="${paints.surface}" stop-opacity="${OLD_CRT_WIDE_GLASS_CENTER_OPACITY * 0.64}" />
            <stop offset="82%" stop-color="#000000" stop-opacity="0" />
            <stop offset="100%" stop-color="#000000" stop-opacity="${OLD_CRT_WIDE_GLASS_EDGE_OPACITY}" />
        </radialGradient>
    `;
}

function renderOldCrtRasterPatterns(idPrefix: string, paints: GraphicStylePaints): string {
    return `
        <pattern id="${idPrefix}-scanlines" width="1" height="${OLD_CRT_SCANLINE_PERIOD}" patternUnits="userSpaceOnUse">
            <rect y="${OLD_CRT_SCANLINE_PERIOD - OLD_CRT_SCANLINE_DARK_BAND_HEIGHT - 0.45}"
                width="1" height="${OLD_CRT_SCANLINE_DARK_BAND_HEIGHT}"
                fill="#000000" opacity="${OLD_CRT_SCANLINE_DARK_BAND_OPACITY}" />
        </pattern>
        <pattern id="${idPrefix}-phosphor-grain" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect x="1" y="0" width="1" height="4" fill="${paints.surface}" opacity="${OLD_CRT_PHOSPHOR_GRAIN_OPACITY}" />
            <rect x="3" y="2" width="1" height="1" fill="${paints.surface}" opacity="${OLD_CRT_PHOSPHOR_GRAIN_OPACITY}" />
        </pattern>
    `;
}

function renderOldCrtReflectionBlurFilters(idPrefix: string, keySize: KeySize): string {
    return [
        renderOldCrtBlurFilter(`${idPrefix}-main-reflection-blur`, keySize, OLD_CRT_REFLECTION_BLUR),
        renderOldCrtBlurFilter(`${idPrefix}-core-reflection-blur`, keySize, OLD_CRT_REFLECTION_CORE_BLUR),
        renderOldCrtBlurFilter(`${idPrefix}-satellite-reflection-blur`, keySize, OLD_CRT_SATELLITE_REFLECTION_BLUR),
        renderOldCrtBlurFilter(`${idPrefix}-rim-blur`, keySize, OLD_CRT_TOP_RIM_BLUR),
    ].join("");
}

function renderOldCrtGlowFilters(): string {
    return `
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
}

function renderOldCrtReflectionOverlay(keySize: KeySize, paints: GraphicStylePaints, idPrefix: string): string {
    const reflection = scaleOldCrtRect(keySize, {
        x: OLD_CRT_REFLECTION_X,
        y: OLD_CRT_REFLECTION_Y,
        width: OLD_CRT_REFLECTION_WIDTH,
        height: OLD_CRT_REFLECTION_HEIGHT,
    });
    const secondaryReflection = scaleOldCrtRect(keySize, {
        x: OLD_CRT_SATELLITE_REFLECTION_X + (OLD_CRT_SATELLITE_REFLECTION_IRREGULARITY - 0.5) * 18,
        y: OLD_CRT_SATELLITE_REFLECTION_Y + Math.sin(OLD_CRT_SATELLITE_REFLECTION_IRREGULARITY * Math.PI) * 6,
        width: OLD_CRT_SATELLITE_REFLECTION_WIDTH,
        height: OLD_CRT_SATELLITE_REFLECTION_HEIGHT,
    });
    const reflectionCore = scaleOldCrtRect(keySize, {
        x: OLD_CRT_REFLECTION_CORE_X,
        y: OLD_CRT_REFLECTION_CORE_Y,
        width: OLD_CRT_REFLECTION_CORE_WIDTH,
        height: OLD_CRT_REFLECTION_CORE_HEIGHT,
    });
    const topReflectionPath = buildScaledTopReflectionPath(keySize);

    return `
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width * OLD_CRT_REFLECTION_SPREAD / 2}"
                ry="${reflection.height * OLD_CRT_REFLECTION_SPREAD / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${OLD_CRT_REFLECTION_HALO_OPACITY}" />
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width * (1 + (OLD_CRT_REFLECTION_SPREAD - 1) * 0.45) / 2}"
                ry="${reflection.height * (1 + (OLD_CRT_REFLECTION_SPREAD - 1) * 0.45) / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${OLD_CRT_REFLECTION_OPACITY * 0.48}"
                filter="url(#${idPrefix}-main-reflection-blur)" />
            <ellipse cx="${reflection.x}" cy="${reflection.y}"
                rx="${reflection.width / 2}" ry="${reflection.height / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${OLD_CRT_REFLECTION_OPACITY}"
                filter="url(#${idPrefix}-main-reflection-blur)" />
            <ellipse cx="${reflectionCore.x}" cy="${reflectionCore.y}"
                rx="${reflectionCore.width * OLD_CRT_REFLECTION_CORE_SPREAD / 2}"
                ry="${reflectionCore.height * OLD_CRT_REFLECTION_CORE_SPREAD / 2}"
                fill="url(#${idPrefix}-core-reflection)" opacity="${OLD_CRT_REFLECTION_CORE_OPACITY * 0.42}" />
            <ellipse cx="${reflectionCore.x}" cy="${reflectionCore.y}"
                rx="${reflectionCore.width / 2}" ry="${reflectionCore.height / 2}"
                fill="url(#${idPrefix}-core-reflection)" opacity="${OLD_CRT_REFLECTION_CORE_OPACITY}"
                filter="url(#${idPrefix}-core-reflection-blur)" />
            <ellipse cx="${secondaryReflection.x}" cy="${secondaryReflection.y}"
                rx="${secondaryReflection.width * OLD_CRT_SATELLITE_REFLECTION_SPREAD / 2}"
                ry="${secondaryReflection.height * OLD_CRT_SATELLITE_REFLECTION_SPREAD / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${OLD_CRT_SATELLITE_REFLECTION_OPACITY * 0.48}" />
            <ellipse cx="${secondaryReflection.x}" cy="${secondaryReflection.y}"
                rx="${secondaryReflection.width / 2}" ry="${secondaryReflection.height / 2}"
                fill="url(#${idPrefix}-main-reflection)" opacity="${OLD_CRT_SATELLITE_REFLECTION_OPACITY}"
                filter="url(#${idPrefix}-satellite-reflection-blur)" />
            <path d="${topReflectionPath}" fill="${paints.surface}"
                opacity="${OLD_CRT_TOP_RIM_OPACITY}" filter="url(#${idPrefix}-rim-blur)" />
    `;
}

function renderOldCrtGlassOverlay(keySize: KeySize, idPrefix: string): string {
    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-curved-glass)" />
        ${renderWideOldCrtConvexGlass(keySize, idPrefix)}
    `;
}

function renderOldCrtFrameShadeOverlay(keySize: KeySize, idPrefix: string): string {
    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-edge-shade)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-vertical-shade)" />
        <rect x="1.5" y="1.5" width="${keySize.width - 3}" height="${keySize.height - 3}"
            rx="${OLD_CRT_RADIUS - 1.5}" fill="none" stroke="#000000" stroke-opacity="0.52" stroke-width="3" />
    `;
}

function oldCrtIdPrefix(keySize: KeySize): string {
    return `old-crt-${keySize.width}-${keySize.height}`;
}

function scaleOldCrtX(keySize: KeySize, value: number): number {
    return value * keySize.width / OLD_CRT_REFERENCE_SIZE;
}

function scaleOldCrtY(keySize: KeySize, value: number): number {
    return value * keySize.height / OLD_CRT_REFERENCE_SIZE;
}

function scaleOldCrtLength(keySize: KeySize, value: number): number {
    return value * Math.min(keySize.width, keySize.height) / OLD_CRT_REFERENCE_SIZE;
}

function scaleOldCrtRect(
    keySize: KeySize,
    rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    return {
        x: scaleOldCrtX(keySize, rect.x),
        y: scaleOldCrtY(keySize, rect.y),
        width: scaleOldCrtX(keySize, rect.width),
        height: scaleOldCrtY(keySize, rect.height),
    };
}

function buildScaledTopReflectionPath(keySize: KeySize): string {
    const startX = scaleOldCrtX(keySize, 8);
    const startY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y);
    const firstControlX = scaleOldCrtX(keySize, 32);
    const firstControlY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y - OLD_CRT_TOP_RIM_CURVE);
    const secondControlX = scaleOldCrtX(keySize, 78);
    const secondControlY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y - OLD_CRT_TOP_RIM_CURVE * 0.95);
    const firstEndX = scaleOldCrtX(keySize, 136);
    const firstEndY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y - 2);
    const lineEndY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y + OLD_CRT_TOP_RIM_HEIGHT);
    const thirdControlX = scaleOldCrtX(keySize, 88);
    const thirdControlY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y + OLD_CRT_TOP_RIM_HEIGHT - OLD_CRT_TOP_RIM_CURVE * 0.70);
    const fourthControlX = scaleOldCrtX(keySize, 38);
    const fourthControlY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y + OLD_CRT_TOP_RIM_HEIGHT - OLD_CRT_TOP_RIM_CURVE * 0.55);
    const secondEndY = scaleOldCrtY(keySize, OLD_CRT_TOP_RIM_Y + OLD_CRT_TOP_RIM_HEIGHT + 2);

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

function renderOldCrtBlurFilter(id: string, keySize: KeySize, blur: number): string {
    return `
        <filter id="${id}" filterUnits="userSpaceOnUse"
            x="-${keySize.width}" y="-${keySize.height}" width="${keySize.width * 3}" height="${keySize.height * 3}">
            <feGaussianBlur stdDeviation="${formatSvgNumber(scaleOldCrtLength(keySize, blur))}" />
        </filter>
    `;
}

function renderOldCrtScreenDisplacementFilter(idPrefix: string, keySize: KeySize): string {
    if (!shouldRenderOldCrtScreenDisplacement(keySize)) {
        return "";
    }

    return `
        <filter id="${idPrefix}-screen-displacement" filterUnits="userSpaceOnUse"
            x="-12" y="-12" width="${keySize.width + 24}" height="${keySize.height + 24}"
            color-interpolation-filters="sRGB">
            <feImage href="${OLD_CRT_CONVEX_DISPLACEMENT_MAP_URI}" x="0" y="0"
                width="${keySize.width}" height="${keySize.height}" preserveAspectRatio="none" result="convexMap" />
            <feGaussianBlur in="convexMap"
                stdDeviation="${scaleOldCrtLength(keySize, OLD_CRT_CONVEX_DISPLACEMENT_MAP_BLUR)}"
                result="smoothConvexMap" />
            <feDisplacementMap in="SourceGraphic" in2="smoothConvexMap"
                scale="${scaleOldCrtLength(keySize, OLD_CRT_CONVEX_DISPLACEMENT_SCALE)}"
                xChannelSelector="R" yChannelSelector="G" />
        </filter>
    `;
}

function renderWideOldCrtConvexGlass(keySize: KeySize, idPrefix: string): string {
    if (shouldRenderOldCrtScreenDisplacement(keySize)) {
        return "";
    }

    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${OLD_CRT_RADIUS}" fill="url(#${idPrefix}-wide-curved-glass)" />
    `;
}

function shouldRenderOldCrtScreenDisplacement(keySize: KeySize): boolean {
    return keySize.width === keySize.height;
}

function buildOldCrtConvexDisplacementMapUri(): string {
    const rects: string[] = [];

    for (let yCoordinate = 0; yCoordinate < OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE; yCoordinate += 1) {
        for (let xCoordinate = 0; xCoordinate < OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE; xCoordinate += 1) {
            const normalizedX = ((xCoordinate + 0.5) / OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE - 0.5) * 2;
            const normalizedY = ((yCoordinate + 0.5) / OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE - 0.5) * 2;
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
        `<svg xmlns="http://www.w3.org/2000/svg" width="${OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE}"`,
        ` height="${OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE}" viewBox="0 0`,
        ` ${OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE} ${OLD_CRT_CONVEX_DISPLACEMENT_MAP_SIZE}">`,
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

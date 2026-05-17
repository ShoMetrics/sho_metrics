import { adjustHexColorBrightness } from "../../view-rendering/svg-utils";
import type { KeySize } from "../../view-rendering/widget-data";
import type { ThemeBackgroundFill, ThemeStyle, ThemeStylePaints } from "./theme-style";

type SoftTriangleBackgroundFill = Extract<ThemeBackgroundFill, {
    readonly fillKind: "soft-triangle";
}>;

const SOFT_TRIANGLE_CENTER_X_RATIO = 0.5;
const SOFT_TRIANGLE_CENTER_Y_RATIO = 0.46;
const COLOR_FILLED_RADIUS = 12;

export const colorFilledStyle: ThemeStyle = {
    styleId: "color-filled",
    renderDefs(keySize, paints) {
        return renderColorFilledDefs(keySize, paints.backgroundFill);
    },
    renderBackground(keySize, paints) {
        return renderColorFilledBackground(keySize, paints);
    },
    renderOverlay(keySize) {
        return `<rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="rgba(255,255,255,0.08)" />`;
    },
};

function renderColorFilledDefs(keySize: KeySize, backgroundFill: ThemeBackgroundFill | undefined): string {
    if (!backgroundFill?.isGradientEnabled) {
        return "";
    }

    const idPrefix = colorFilledIdPrefix(keySize);

    if (backgroundFill.fillKind === "solid") {
        return `
            <linearGradient id="${idPrefix}-solid" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="${adjustHexColorBrightness(backgroundFill.color, -18)}" />
                <stop offset="58%" stop-color="${backgroundFill.color}" />
                <stop offset="100%" stop-color="${adjustHexColorBrightness(backgroundFill.color, 22)}" />
            </linearGradient>
        `;
    }

    return `
        <radialGradient id="${idPrefix}-low" cx="12%" cy="14%" r="82%">
            <stop offset="0%" stop-color="${adjustHexColorBrightness(backgroundFill.lowColor, 16)}" stop-opacity="1" />
            <stop offset="48%" stop-color="${backgroundFill.lowColor}" stop-opacity="0.90" />
            <stop offset="100%" stop-color="${backgroundFill.lowColor}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="${idPrefix}-medium" cx="88%" cy="14%" r="82%">
            <stop offset="0%" stop-color="${adjustHexColorBrightness(backgroundFill.mediumColor, 16)}" stop-opacity="1" />
            <stop offset="48%" stop-color="${backgroundFill.mediumColor}" stop-opacity="0.88" />
            <stop offset="100%" stop-color="${backgroundFill.mediumColor}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="${idPrefix}-high" cx="50%" cy="105%" r="78%">
            <stop offset="0%" stop-color="${adjustHexColorBrightness(backgroundFill.highColor, 10)}" stop-opacity="1" />
            <stop offset="58%" stop-color="${backgroundFill.highColor}" stop-opacity="0.88" />
            <stop offset="100%" stop-color="${backgroundFill.highColor}" stop-opacity="0" />
        </radialGradient>
    `;
}

function renderColorFilledBackground(keySize: KeySize, paints: ThemeStylePaints): string {
    const backgroundFill = paints.backgroundFill;

    if (!backgroundFill) {
        return `<rect width="${keySize.width}" height="${keySize.height}" fill="${paints.background}" />`;
    }

    if (backgroundFill.fillKind === "solid") {
        const fill = backgroundFill.isGradientEnabled
            ? `url(#${colorFilledIdPrefix(keySize)}-solid)`
            : backgroundFill.color;

        return `<rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="${fill}" />`;
    }

    return renderSoftTriangleBackground(keySize, backgroundFill);
}

function renderSoftTriangleBackground(keySize: KeySize, backgroundFill: SoftTriangleBackgroundFill): string {
    if (backgroundFill.isGradientEnabled) {
        return renderSoftTriangleGradientBackground(keySize, backgroundFill);
    }

    return renderSoftTriangleRegionBackground(keySize, backgroundFill);
}

function renderSoftTriangleGradientBackground(keySize: KeySize, backgroundFill: SoftTriangleBackgroundFill): string {
    const idPrefix = colorFilledIdPrefix(keySize);

    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="${backgroundFill.highColor}" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="url(#${idPrefix}-low)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="url(#${idPrefix}-medium)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="url(#${idPrefix}-high)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="rgba(255,255,255,0.04)" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
    `;
}

function renderSoftTriangleRegionBackground(keySize: KeySize, backgroundFill: SoftTriangleBackgroundFill): string {
    const centerXCoordinate = keySize.width * SOFT_TRIANGLE_CENTER_X_RATIO;
    const centerYCoordinate = keySize.height * SOFT_TRIANGLE_CENTER_Y_RATIO;

    return `
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="${backgroundFill.highColor}" />
        <path d="M0 0 L${centerXCoordinate} 0 L${centerXCoordinate} ${centerYCoordinate} L0 ${keySize.height} Z"
            fill="${backgroundFill.lowColor}" />
        <path d="M${centerXCoordinate} 0 L${keySize.width} 0 L${keySize.width} ${keySize.height} L${centerXCoordinate} ${centerYCoordinate} Z"
            fill="${backgroundFill.mediumColor}" />
        <path d="M0 ${keySize.height} L${centerXCoordinate} ${centerYCoordinate} L${keySize.width} ${keySize.height} Z"
            fill="${backgroundFill.highColor}" />
        <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
            rx="${COLOR_FILLED_RADIUS}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
    `;
}

function colorFilledIdPrefix(keySize: KeySize): string {
    return `color-filled-${keySize.width}-${keySize.height}`;
}

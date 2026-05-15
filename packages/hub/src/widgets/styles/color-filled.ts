import type { KeySize } from "../../rendering/widget-data";
import type { GraphicBackgroundFill, GraphicStyle, GraphicStylePaints } from "./style.interface";

export const colorFilledStyle: GraphicStyle = {
    styleId: "color-filled",
    renderDefs(keySize, paints) {
        return renderColorFilledDefs(keySize, paints.backgroundFill);
    },
    renderBackground(keySize, paints) {
        return renderColorFilledBackground(keySize, paints);
    },
    renderOverlay() {
        return "";
    },
};

function renderColorFilledDefs(keySize: KeySize, backgroundFill: GraphicBackgroundFill | undefined): string {
    if (!backgroundFill?.isGradientEnabled) {
        return "";
    }

    const idPrefix = colorFilledIdPrefix(keySize);

    if (backgroundFill.fillKind === "solid") {
        return `
            <radialGradient id="${idPrefix}-solid" cx="32%" cy="18%" r="92%">
                <stop offset="0%" stop-color="${backgroundFill.color}" stop-opacity="1" />
                <stop offset="58%" stop-color="${backgroundFill.color}" stop-opacity="0.82" />
                <stop offset="100%" stop-color="${backgroundFill.color}" stop-opacity="1" />
            </radialGradient>
        `;
    }

    return `
        <radialGradient id="${idPrefix}-low" cx="14%" cy="18%" r="88%">
            <stop offset="0%" stop-color="${backgroundFill.lowColor}" stop-opacity="1" />
            <stop offset="100%" stop-color="${backgroundFill.lowColor}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="${idPrefix}-medium" cx="86%" cy="16%" r="88%">
            <stop offset="0%" stop-color="${backgroundFill.mediumColor}" stop-opacity="1" />
            <stop offset="100%" stop-color="${backgroundFill.mediumColor}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="${idPrefix}-high" cx="50%" cy="104%" r="92%">
            <stop offset="0%" stop-color="${backgroundFill.highColor}" stop-opacity="1" />
            <stop offset="100%" stop-color="${backgroundFill.highColor}" stop-opacity="0" />
        </radialGradient>
    `;
}

function renderColorFilledBackground(keySize: KeySize, paints: GraphicStylePaints): string {
    const backgroundFill = paints.backgroundFill;

    if (!backgroundFill) {
        return `<rect width="${keySize.width}" height="${keySize.height}" fill="${paints.background}" />`;
    }

    if (backgroundFill.fillKind === "solid") {
        const fill = backgroundFill.isGradientEnabled
            ? `url(#${colorFilledIdPrefix(keySize)}-solid)`
            : backgroundFill.color;

        return `<rect width="${keySize.width}" height="${keySize.height}" fill="${fill}" />`;
    }

    if (backgroundFill.isGradientEnabled) {
        const idPrefix = colorFilledIdPrefix(keySize);

        return `
            <rect width="${keySize.width}" height="${keySize.height}" fill="${backgroundFill.lowColor}" />
            <rect width="${keySize.width}" height="${keySize.height}" fill="url(#${idPrefix}-low)" />
            <rect width="${keySize.width}" height="${keySize.height}" fill="url(#${idPrefix}-medium)" />
            <rect width="${keySize.width}" height="${keySize.height}" fill="url(#${idPrefix}-high)" />
        `;
    }

    return `
        <polygon points="0,0 ${keySize.width / 2},${keySize.height * 0.55} 0,${keySize.height}" fill="${backgroundFill.lowColor}" />
        <polygon points="${keySize.width},0 ${keySize.width / 2},${keySize.height * 0.55} ${keySize.width},${keySize.height}" fill="${backgroundFill.mediumColor}" />
        <polygon points="0,${keySize.height} ${keySize.width / 2},${keySize.height * 0.55} ${keySize.width},${keySize.height}" fill="${backgroundFill.highColor}" />
    `;
}

function colorFilledIdPrefix(keySize: KeySize): string {
    return `color-filled-${keySize.width}-${keySize.height}`;
}

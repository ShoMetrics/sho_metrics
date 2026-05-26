import { PIXEL_RENDER_FONT_FAMILY } from "../../view-rendering/render-text-style";
import { clamp, escapeSvgText } from "../../view-rendering/svg-utils";
import { DEFAULT_PIXEL_WINDOW_PALETTE } from "../../view-rendering/pixel-window-theme-tokens";
import type { KeySize } from "../../view-rendering/widget-data";
import type { ThemeBodyViewport, ThemeStyle } from "./theme-style";

interface PixelWindowRect {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
}

interface PixelWindowGeometry {
    readonly frame: PixelWindowRect;
    readonly innerFrame: PixelWindowRect;
    readonly titleBar: PixelWindowRect;
    readonly bodyViewport: ThemeBodyViewport;
}

const PIXEL_WINDOW_OUTER_BORDER_THICKNESS = 2;
const PIXEL_WINDOW_INNER_BORDER_THICKNESS = 2;
const PIXEL_WINDOW_TITLE_TEXT = "ShoMetrics";

export const pixelWindowStyle: ThemeStyle = {
    styleId: "pixel-window",

    renderDefs(): string {
        return "";
    },

    renderBackground(keySize: KeySize): string {
        const geometry = resolvePixelWindowGeometry(keySize);

        return `
            <rect x="0" y="0" width="${keySize.width}" height="${keySize.height}"
                fill="${DEFAULT_PIXEL_WINDOW_PALETTE.clientBackground}" />
            <rect x="${geometry.frame.xCoordinate}" y="${geometry.frame.yCoordinate}"
                width="${geometry.frame.width}" height="${geometry.frame.height}"
                fill="${DEFAULT_PIXEL_WINDOW_PALETTE.outerBorder}" />
            <rect x="${geometry.innerFrame.xCoordinate}" y="${geometry.innerFrame.yCoordinate}"
                width="${geometry.innerFrame.width}" height="${geometry.innerFrame.height}"
                fill="${DEFAULT_PIXEL_WINDOW_PALETTE.innerBorder}" />
            <rect x="${geometry.titleBar.xCoordinate}" y="${geometry.titleBar.yCoordinate}"
                width="${geometry.titleBar.width}" height="${geometry.titleBar.height}"
                fill="${DEFAULT_PIXEL_WINDOW_PALETTE.titleBar}" />
            <rect x="${geometry.bodyViewport.xCoordinate}" y="${geometry.bodyViewport.yCoordinate}"
                width="${geometry.bodyViewport.width}" height="${geometry.bodyViewport.height}"
                fill="${DEFAULT_PIXEL_WINDOW_PALETTE.clientBackground}" />
            ${renderTitleBarText(geometry)}
            ${renderWindowControl(geometry)}
        `;
    },

    resolveBodyViewport(keySize: KeySize): ThemeBodyViewport {
        return resolvePixelWindowGeometry(keySize).bodyViewport;
    },

    renderOverlay(): string {
        return "";
    },
};

function resolvePixelWindowGeometry(keySize: KeySize): PixelWindowGeometry {
    const minimumSize = Math.min(keySize.width, keySize.height);
    const outerMargin = clamp(Math.round(minimumSize * 0.03), 3, 6);
    const titleBarHeight = clamp(Math.round(keySize.height * 0.125), 14, 20);
    const clientInset = outerMargin + PIXEL_WINDOW_OUTER_BORDER_THICKNESS + PIXEL_WINDOW_INNER_BORDER_THICKNESS;
    const frameWidth = Math.max(1, keySize.width - outerMargin * 2);
    const frameHeight = Math.max(1, keySize.height - outerMargin * 2);
    const innerXCoordinate = outerMargin + PIXEL_WINDOW_OUTER_BORDER_THICKNESS;
    const innerYCoordinate = outerMargin + PIXEL_WINDOW_OUTER_BORDER_THICKNESS;
    const innerWidth = Math.max(1, keySize.width - innerXCoordinate * 2);
    const innerHeight = Math.max(1, keySize.height - innerYCoordinate * 2);
    const bodyViewport = {
        xCoordinate: clientInset,
        yCoordinate: clientInset + titleBarHeight,
        width: Math.max(1, keySize.width - clientInset * 2),
        height: Math.max(1, keySize.height - clientInset * 2 - titleBarHeight),
        clipRadius: 0,
    } satisfies ThemeBodyViewport;

    return {
        frame: {
            xCoordinate: outerMargin,
            yCoordinate: outerMargin,
            width: frameWidth,
            height: frameHeight,
        },
        innerFrame: {
            xCoordinate: innerXCoordinate,
            yCoordinate: innerYCoordinate,
            width: innerWidth,
            height: innerHeight,
        },
        titleBar: {
            xCoordinate: bodyViewport.xCoordinate,
            yCoordinate: clientInset,
            width: bodyViewport.width,
            height: titleBarHeight,
        },
        bodyViewport,
    };
}

function renderTitleBarText(geometry: PixelWindowGeometry): string {
    const fontSize = Math.round(clamp(geometry.titleBar.height * 0.58, 9, 11));
    const xCoordinate = geometry.titleBar.xCoordinate + 5;
    const yCoordinate = geometry.titleBar.yCoordinate + Math.floor(geometry.titleBar.height / 2);

    // Frame chrome text is renderer-local and intentionally bypasses metric text layout.
    return `<text x="${xCoordinate}" y="${yCoordinate}" fill="${DEFAULT_PIXEL_WINDOW_PALETTE.titleText}"
            font-family="${escapeSvgText(PIXEL_RENDER_FONT_FAMILY)}" font-size="${fontSize}"
            font-weight="400" dominant-baseline="middle">${escapeSvgText(PIXEL_WINDOW_TITLE_TEXT)}</text>`;
}

function renderWindowControl(geometry: PixelWindowGeometry): string {
    const controlSize = Math.max(8, Math.min(12, geometry.titleBar.height - 6));
    const xCoordinate = geometry.titleBar.xCoordinate + geometry.titleBar.width - controlSize - 3;
    const yCoordinate = geometry.titleBar.yCoordinate + Math.floor((geometry.titleBar.height - controlSize) / 2);
    const iconInset = 2;
    const startXCoordinate = xCoordinate + iconInset;
    const endXCoordinate = xCoordinate + controlSize - iconInset;
    const startYCoordinate = yCoordinate + iconInset;
    const endYCoordinate = yCoordinate + controlSize - iconInset;

    return `
        <rect x="${xCoordinate}" y="${yCoordinate}" width="${controlSize}" height="${controlSize}"
            fill="${DEFAULT_PIXEL_WINDOW_PALETTE.controlButton}"
            stroke="${DEFAULT_PIXEL_WINDOW_PALETTE.titleText}" stroke-width="1" />
        <path d="M ${startXCoordinate} ${startYCoordinate} L ${endXCoordinate} ${endYCoordinate}
            M ${endXCoordinate} ${startYCoordinate} L ${startXCoordinate} ${endYCoordinate}"
            stroke="${DEFAULT_PIXEL_WINDOW_PALETTE.titleText}" stroke-width="1"
            stroke-linecap="square" />
    `;
}

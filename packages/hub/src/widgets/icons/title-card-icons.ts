import type { RenderOutlineTokens } from "../../view-rendering/color/render-appearance";
import { buildSvgFilterAttributes } from "../../view-rendering/rasterize/render-svg-effects";
import { escapeSvgText, isSvgOutlineEnabled } from "../../view-rendering/rasterize/svg-utils";

export type TitleCardDirectionIconDirection = "up" | "down";

interface TitleCardDirectionIconOptions {
    readonly id: string;
    readonly direction: TitleCardDirectionIconDirection;
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly fontSize: number;
    readonly fill: string;
    readonly filter: string | undefined;
    readonly outline: RenderOutlineTokens | undefined;
}

/**
 * Renders a direction arrow tuned for the tiny inline title-card metric slot.
 *
 * This module is title-card-specific until another metric family shares these
 * glyphs; rename it when that happens.
 */
export function renderTitleCardDirectionIconFragment(options: TitleCardDirectionIconOptions): string {
    const arrowHeight = options.fontSize * 0.82;
    const arrowHeadSize = options.fontSize * 0.28;
    const centerXCoordinate = options.xCoordinate + options.fontSize * 0.38;
    const topYCoordinate = options.yCoordinate - arrowHeight / 2;
    const bottomYCoordinate = options.yCoordinate + arrowHeight / 2;
    const tipYCoordinate = options.direction === "up" ? topYCoordinate : bottomYCoordinate;
    const tailYCoordinate = options.direction === "up" ? bottomYCoordinate : topYCoordinate;
    const headYCoordinate = options.direction === "up"
        ? tipYCoordinate + arrowHeadSize
        : tipYCoordinate - arrowHeadSize;
    const pathData = [
        `M ${formatSvgNumber(centerXCoordinate)} ${formatSvgNumber(tailYCoordinate)}`,
        `L ${formatSvgNumber(centerXCoordinate)} ${formatSvgNumber(tipYCoordinate)}`,
        `M ${formatSvgNumber(centerXCoordinate)} ${formatSvgNumber(tipYCoordinate)}`,
        `L ${formatSvgNumber(centerXCoordinate - arrowHeadSize)} ${formatSvgNumber(headYCoordinate)}`,
        `M ${formatSvgNumber(centerXCoordinate)} ${formatSvgNumber(tipYCoordinate)}`,
        `L ${formatSvgNumber(centerXCoordinate + arrowHeadSize)} ${formatSvgNumber(headYCoordinate)}`,
    ].join(" ");
    const filterAttributes = buildSvgFilterAttributes(options.filter);
    const filterAttribute = filterAttributes.length > 0 ? ` ${filterAttributes.join(" ")}` : "";
    const outlinePath = isSvgOutlineEnabled(options.outline)
        ? `<path d="${pathData}" fill="none" stroke="${escapeSvgText(options.outline.color)}"
                stroke-opacity="${formatSvgNumber(options.outline.strength)}"
                stroke-width="${formatSvgNumber(options.fontSize * 0.34)}"
                stroke-linecap="round" stroke-linejoin="round" />`
        : "";

    return `
        <g id="${options.id}"${filterAttribute}>
            ${outlinePath}
            <path d="${pathData}" fill="none" stroke="${escapeSvgText(options.fill)}"
                stroke-width="${formatSvgNumber(options.fontSize * 0.13)}"
                stroke-linecap="round" stroke-linejoin="round" />
        </g>
    `;
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

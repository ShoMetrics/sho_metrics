import type { SvgIconDefinition } from "./icon-types";

export function renderCenteredIconFragment(icon: SvgIconDefinition, size: number): string {
    const scaledSize = size * icon.opticalScale;
    const xCoordinate = -scaledSize / 2 + icon.opticalOffsetX;
    const yCoordinate = -scaledSize / 2 + icon.opticalOffsetY;

    return `
        <svg x="${xCoordinate}" y="${yCoordinate}" width="${scaledSize}" height="${scaledSize}"
            viewBox="${icon.viewBox.x} ${icon.viewBox.y} ${icon.viewBox.width} ${icon.viewBox.height}"
            preserveAspectRatio="xMidYMid meet">
            ${icon.fragment}
        </svg>
    `;
}

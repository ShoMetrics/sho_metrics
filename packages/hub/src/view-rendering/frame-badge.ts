import type { MetricRenderAppearance } from "./render-appearance";
import { buildSvgFilterAttributes } from "./render-svg-effects";
import { parseHexColor, resolveReadableTextColor } from "../shared/color-utils";
import type { KeySize } from "./widget-data";

/** SVG bounds of a badge inside the full rendered frame. */
export interface FrameBadgeBox {
    readonly xCoordinate: number;
    readonly yCoordinate: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Frame corners currently safe for transient badge overlays.
 *
 * The current view styles reserve broadly safe overlay space only on the
 * right-side corners. Add left-side corners only together with view-specific
 * spacing changes; title-card and similar layouts otherwise collide with them.
 */
export type FrameBadgeCorner = "lowerRight" | "upperRight";

const FRAME_BADGE_MARGIN = 5;
const FRAME_BADGE_STROKE_WIDTH = 0.75;

/** Renders the shared frame-anchored chrome used by transient metric badges. */
export function renderFrameBadge(options: {
    readonly className: string;
    readonly visual: MetricRenderAppearance;
    readonly size: KeySize;
    readonly width: number;
    readonly height: number;
    readonly cornerRadius: number;
    readonly corner: FrameBadgeCorner;
    readonly renderContent: (foregroundColor: string, box: FrameBadgeBox) => string;
}): string {
    const box = resolveFrameBadgeBox({
        size: options.size,
        width: options.width,
        height: options.height,
        corner: options.corner,
    });
    const backgroundColor = options.visual.paints.surface;
    const foregroundColor = parseHexColor(backgroundColor) === undefined
        ? options.visual.paints.primaryText
        : resolveReadableTextColor(backgroundColor);

    return `
        <g class="${options.className}">
            <rect x="${box.xCoordinate.toFixed(2)}" y="${box.yCoordinate.toFixed(2)}"
                width="${box.width.toFixed(2)}" height="${box.height.toFixed(2)}" rx="${options.cornerRadius}"
                fill="${backgroundColor}" stroke="${options.visual.paints.divider}" stroke-width="${FRAME_BADGE_STROKE_WIDTH}"
                ${buildSvgFilterAttributes(options.visual.themeEffects.subtleFilter).join(" ")} />
            ${options.renderContent(foregroundColor, box)}
        </g>
    `;
}

function resolveFrameBadgeBox(options: {
    readonly size: KeySize;
    readonly width: number;
    readonly height: number;
    readonly corner: FrameBadgeCorner;
}): FrameBadgeBox {
    const xCoordinate = options.size.width - FRAME_BADGE_MARGIN - options.width;
    const yCoordinate = options.corner === "upperRight"
        ? FRAME_BADGE_MARGIN
        : options.size.height - FRAME_BADGE_MARGIN - options.height;

    return {
        xCoordinate,
        yCoordinate,
        width: options.width,
        height: options.height,
    };
}

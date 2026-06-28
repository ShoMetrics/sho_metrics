import { RefreshCw } from "lucide";
import type { KeySize } from "./widget-data";
import { createLucideIconDefinition } from "../widgets/icons/sources/lucide";
import { renderCenteredIconFragment } from "../widgets/icons/render-icon";
import { renderFrameBadge, type FrameBadgeBox } from "./frame-badge";
import type { MetricRenderAppearance } from "./render-appearance";

/**
 * Render-facing marker for the transient manual refresh badge.
 *
 * The badge is intentionally only visible/absent. Collection diagnostics have
 * richer statuses, but those statuses must not become separate overlay states.
 */
export type MetricRefreshIndicator = "visible";

const INDICATOR_WIDTH = 42;
const INDICATOR_HEIGHT = 16;
const INDICATOR_CORNER_RADIUS = 7;
const REFRESH_ICON_SIZE = 10.5;
const DOT_RADIUS = 1.45;
const DOT_GAP = 4.2;
const REFRESH_ICON = createLucideIconDefinition({
    id: "manual-refresh",
    node: RefreshCw,
    strokeWidth: 2.6,
});

/** Renders the frame-anchored manual refresh badge. */
export function renderMetricRefreshIndicator(options: {
    readonly visual: MetricRenderAppearance;
    readonly size: KeySize;
}): string {
    return renderFrameBadge({
        className: "metric-refresh-indicator",
        visual: options.visual,
        size: options.size,
        width: INDICATOR_WIDTH,
        height: INDICATOR_HEIGHT,
        cornerRadius: INDICATOR_CORNER_RADIUS,
        corner: "lowerLeft",
        renderContent: renderRefreshIndicatorContent,
    });
}

function renderRefreshIndicatorContent(foregroundColor: string, box: FrameBadgeBox): string {
    const iconCenterXCoordinate = box.xCoordinate + 12;
    const centerYCoordinate = box.yCoordinate + (box.height / 2);

    return `
        <g class="metric-refresh-indicator-icon" color="${foregroundColor}"
            transform="translate(${iconCenterXCoordinate.toFixed(2)} ${centerYCoordinate.toFixed(2)})">
            ${renderCenteredIconFragment(REFRESH_ICON, REFRESH_ICON_SIZE)}
        </g>
        <g class="metric-refresh-indicator-ellipsis">
        ${renderEllipsisDots({
            firstDotXCoordinate: box.xCoordinate + 27,
            centerYCoordinate,
            color: foregroundColor,
        })}
        </g>
    `;
}

function renderEllipsisDots(options: {
    readonly firstDotXCoordinate: number;
    readonly centerYCoordinate: number;
    readonly color: string;
}): string {
    return Array.from({ length: 3 }, (_, index) => `
        <circle cx="${(options.firstDotXCoordinate + (index * DOT_GAP)).toFixed(2)}"
            cy="${options.centerYCoordinate.toFixed(2)}" r="${DOT_RADIUS}"
            fill="${options.color}" />
    `).join("");
}

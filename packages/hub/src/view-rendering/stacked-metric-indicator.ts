import type { MetricRenderAppearance } from "./render-appearance";
import type { KeySize } from "./widget-data";
import { renderFrameBadge, type FrameBadgeBox } from "./frame-badge";

export interface StackedMetricIndicator {
    /** 1-based active slot index. Renderers may display this as text or position. */
    readonly currentIndex: number;
    readonly totalCount: number;
}

const DOT_RADIUS = 3.2;
const DOT_GAP = 4;
const INDICATOR_PADDING_X = 4.5;
const INDICATOR_PADDING_Y = 4;
const INDICATOR_CORNER_RADIUS = 7;
const INACTIVE_DOT_OPACITY = 0.32;

export function renderStackedMetricIndicator(options: {
    readonly indicator: StackedMetricIndicator;
    readonly visual: MetricRenderAppearance;
    readonly size: KeySize;
}): string {
    if (options.indicator.totalCount <= 1) {
        return "";
    }

    // The indicator is intentionally anchored to the frame, not the theme body
    // viewport, so pixel-window and touch-strip layouts keep the same badge
    // position as flat themes.
    const totalCount = Math.max(2, options.indicator.totalCount);
    const currentIndex = Math.min(Math.max(1, options.indicator.currentIndex), totalCount);
    const indicatorWidth = (INDICATOR_PADDING_X * 2) + (DOT_RADIUS * 2 * totalCount) + (DOT_GAP * (totalCount - 1));
    const indicatorHeight = (INDICATOR_PADDING_Y * 2) + (DOT_RADIUS * 2);

    return renderFrameBadge({
        className: "stacked-metric-indicator",
        visual: options.visual,
        size: options.size,
        width: indicatorWidth,
        height: indicatorHeight,
        cornerRadius: INDICATOR_CORNER_RADIUS,
        corner: "lowerRight",
        renderContent: (dotColor, box) => renderIndicatorDots({
            box,
            dotColor,
            totalCount,
            currentIndex,
        }),
    });
}

function renderIndicatorDots(options: {
    readonly box: FrameBadgeBox;
    readonly dotColor: string;
    readonly totalCount: number;
    readonly currentIndex: number;
}): string {
    return Array.from({ length: options.totalCount }, (_, index) => renderIndicatorDot({
        centerXCoordinate: options.box.xCoordinate
            + INDICATOR_PADDING_X
            + DOT_RADIUS
            + (index * ((DOT_RADIUS * 2) + DOT_GAP)),
        centerYCoordinate: options.box.yCoordinate + (options.box.height / 2),
        color: options.dotColor,
        isActive: index + 1 === options.currentIndex,
    })).join("");
}

function renderIndicatorDot(options: {
    readonly centerXCoordinate: number;
    readonly centerYCoordinate: number;
    readonly color: string;
    readonly isActive: boolean;
}): string {
    const opacity = options.isActive ? 1 : INACTIVE_DOT_OPACITY;

    return `
        <circle cx="${options.centerXCoordinate.toFixed(2)}" cy="${options.centerYCoordinate.toFixed(2)}" r="${DOT_RADIUS}"
            fill="${options.color}" opacity="${opacity}" />
    `;
}

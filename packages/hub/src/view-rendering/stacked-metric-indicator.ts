import type { MetricRenderAppearance } from "./render-appearance";
import { buildSvgFilterAttributes } from "./render-svg-effects";
import { parseHexColor, resolveReadableTextColor } from "../shared/color-utils";
import type { KeySize } from "./widget-data";

export interface StackedMetricIndicator {
    /** 1-based active slot index. Renderers may display this as text or position. */
    readonly currentIndex: number;
    readonly totalCount: number;
}

const INDICATOR_MARGIN = 5;
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
    const xCoordinate = options.size.width - INDICATOR_MARGIN - indicatorWidth;
    const yCoordinate = options.size.height - INDICATOR_MARGIN - indicatorHeight;
    const backgroundColor = options.visual.paints.surface;
    const dotColor = parseHexColor(backgroundColor) === undefined
        ? options.visual.paints.primaryText
        : resolveReadableTextColor(backgroundColor);

    return `
        <g class="stacked-metric-indicator">
            <rect x="${xCoordinate.toFixed(2)}" y="${yCoordinate.toFixed(2)}"
                width="${indicatorWidth.toFixed(2)}" height="${indicatorHeight.toFixed(2)}" rx="${INDICATOR_CORNER_RADIUS}"
                fill="${backgroundColor}" stroke="${options.visual.paints.divider}" stroke-width="0.75"
                ${buildSvgFilterAttributes(options.visual.themeEffects.subtleFilter).join(" ")} />
            ${Array.from({ length: totalCount }, (_, index) => renderIndicatorDot({
                centerXCoordinate: xCoordinate + INDICATOR_PADDING_X + DOT_RADIUS + (index * ((DOT_RADIUS * 2) + DOT_GAP)),
                centerYCoordinate: yCoordinate + (indicatorHeight / 2),
                color: dotColor,
                isActive: index + 1 === currentIndex,
            })).join("")}
        </g>
    `;
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

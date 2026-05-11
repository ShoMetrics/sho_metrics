import { clamp } from "../../rendering/svg-utils";

export type SparklineGridLineVisibility = "adaptive" | "always" | "none";
export type SparklineGridLineType = "horizontal" | "vertical";

export interface SparklineGridLinePoint {
    xCoordinate: number;
    yCoordinate: number;
}

export interface SparklineGridLineLayout {
    xCoordinate: number;
    yCoordinate: number;
    width: number;
    height: number;
}

export interface SparklineGridLineMetrics {
    opacity: number;
    activity: number;
    verticalRange: number;
    averageStep: number;
    pointCount: number;
}

const HORIZONTAL_GUIDE_LINE_OPACITY = 0.24;
const ADAPTIVE_GUIDE_STEADY_OPACITY = 0.18;
const ADAPTIVE_GUIDE_ACTIVE_OPACITY = 0.055;
const VERTICAL_GUIDE_LINE_OPACITY = 1;
const ADAPTIVE_VERTICAL_GUIDE_STEADY_OPACITY = 1;
const ADAPTIVE_VERTICAL_GUIDE_ACTIVE_OPACITY = 0.32;
const ADAPTIVE_GUIDE_MINIMUM_POINT_COUNT = 8;
const ADAPTIVE_GUIDE_STEADY_ACTIVITY = 0.06;
const ADAPTIVE_GUIDE_ACTIVE_ACTIVITY = 0.32;

export function resolveSparklineGridLineOpacity(options: {
    gridLineVisibility: SparklineGridLineVisibility;
    gridLineType: SparklineGridLineType;
    points: readonly SparklineGridLinePoint[];
    plotLayout: SparklineGridLineLayout;
}): SparklineGridLineMetrics | undefined {
    if (options.gridLineVisibility === "none") {
        return undefined;
    }

    if (options.gridLineVisibility === "always") {
        return {
            opacity: options.gridLineType === "vertical" ? VERTICAL_GUIDE_LINE_OPACITY : HORIZONTAL_GUIDE_LINE_OPACITY,
            activity: 0,
            verticalRange: 0,
            averageStep: 0,
            pointCount: options.points.length,
        };
    }

    return resolveAdaptiveGuideMetrics(options.points, options.plotLayout, options.gridLineType);
}

function resolveAdaptiveGuideMetrics(
    points: readonly SparklineGridLinePoint[],
    plotLayout: SparklineGridLineLayout,
    gridLineType: SparklineGridLineType,
): SparklineGridLineMetrics {
    if (plotLayout.height <= 0) {
        return {
            opacity: resolveAdaptiveSteadyGuideOpacity(gridLineType),
            activity: 0,
            verticalRange: 0,
            averageStep: 0,
            pointCount: points.length,
        };
    }

    const activityMetrics = calculateSparklineActivityMetrics(points, plotLayout);

    if (points.length < ADAPTIVE_GUIDE_MINIMUM_POINT_COUNT) {
        return {
            ...activityMetrics,
            opacity: resolveAdaptiveSteadyGuideOpacity(gridLineType),
        };
    }

    const progress = smoothStep(
        ADAPTIVE_GUIDE_STEADY_ACTIVITY,
        ADAPTIVE_GUIDE_ACTIVE_ACTIVITY,
        activityMetrics.activity,
    );
    const steadyOpacity = resolveAdaptiveSteadyGuideOpacity(gridLineType);
    const activeOpacity = gridLineType === "vertical"
        ? ADAPTIVE_VERTICAL_GUIDE_ACTIVE_OPACITY
        : ADAPTIVE_GUIDE_ACTIVE_OPACITY;

    return {
        ...activityMetrics,
        opacity: steadyOpacity + (activeOpacity - steadyOpacity) * progress,
    };
}

function resolveAdaptiveSteadyGuideOpacity(gridLineType: SparklineGridLineType): number {
    return gridLineType === "vertical" ? ADAPTIVE_VERTICAL_GUIDE_STEADY_OPACITY : ADAPTIVE_GUIDE_STEADY_OPACITY;
}

function calculateSparklineActivityMetrics(
    points: readonly SparklineGridLinePoint[],
    plotLayout: SparklineGridLineLayout,
): Omit<SparklineGridLineMetrics, "opacity"> {
    let minimumProgress = Number.POSITIVE_INFINITY;
    let maximumProgress = Number.NEGATIVE_INFINITY;
    let totalStep = 0;

    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const progress = normalizePointVerticalProgress(points[pointIndex], plotLayout);
        minimumProgress = Math.min(minimumProgress, progress);
        maximumProgress = Math.max(maximumProgress, progress);

        if (pointIndex === 0) {
            continue;
        }

        const previousProgress = normalizePointVerticalProgress(points[pointIndex - 1], plotLayout);
        const step = progress - previousProgress;
        totalStep += Math.abs(step);
    }

    if (points.length === 0) {
        minimumProgress = 0;
        maximumProgress = 0;
    }

    const verticalRange = maximumProgress - minimumProgress;
    const averageStep = totalStep / Math.max(1, points.length - 1);
    const activity = clamp(
        verticalRange * 0.68
            + averageStep * 5 * 0.32,
        0,
        1,
    );

    return {
        activity,
        verticalRange,
        averageStep,
        pointCount: points.length,
    };
}

function normalizePointVerticalProgress(
    point: SparklineGridLinePoint,
    plotLayout: SparklineGridLineLayout,
): number {
    return clamp(1 - (point.yCoordinate - plotLayout.yCoordinate) / plotLayout.height, 0, 1);
}

function smoothStep(edgeStart: number, edgeEnd: number, value: number): number {
    if (edgeStart === edgeEnd) {
        return value >= edgeEnd ? 1 : 0;
    }

    const progress = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);

    return progress * progress * (3 - 2 * progress);
}

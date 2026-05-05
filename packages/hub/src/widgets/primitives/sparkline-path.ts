import {
    area,
    curveLinear,
    curveMonotoneX,
    line,
    type CurveFactory,
} from "d3-shape";

export interface SparklinePathPoint {
    xCoordinate: number;
    yCoordinate: number;
}

/**
 * Builds shape-preserving SVG paths for chronological sparkline points. D3's
 * monotone-x curve keeps x moving forward, which avoids the misleading
 * left-leaning Bezier handles that can appear in hand-rolled Catmull-Rom paths.
 */
export function buildSparklineLinePath(options: {
    points: readonly SparklinePathPoint[];
    lineSmoothingPercent: number;
}): string {
    if (options.points.length === 0) {
        return "";
    }

    if (options.points.length === 1) {
        const point = options.points[0];
        return `M ${formatSvgNumber(point.xCoordinate)} ${formatSvgNumber(point.yCoordinate)}`;
    }

    return line<SparklinePathPoint>()
        .x((point) => point.xCoordinate)
        .y((point) => point.yCoordinate)
        .curve(resolveSparklineCurve(options.lineSmoothingPercent))(options.points) ?? "";
}

export function buildSparklineAreaPath(options: {
    points: readonly SparklinePathPoint[];
    baselineYCoordinate: number;
    lineSmoothingPercent: number;
}): string {
    if (options.points.length === 0) {
        return "";
    }

    return area<SparklinePathPoint>()
        .x((point) => point.xCoordinate)
        .y0(options.baselineYCoordinate)
        .y1((point) => point.yCoordinate)
        .curve(resolveSparklineCurve(options.lineSmoothingPercent))(options.points) ?? "";
}

function resolveSparklineCurve(lineSmoothingPercent: number): CurveFactory {
    return lineSmoothingPercent > 0 ? curveMonotoneX : curveLinear;
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

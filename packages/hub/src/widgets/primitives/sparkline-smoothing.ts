import { clamp } from "../../view-rendering/rasterize/svg-utils";

// A 60s history at 1s polling is ~60 samples, so a radius-3 window spans ~12% of
// the line: enough to calm sample-to-sample jitter, small enough to keep real
// movement. The window shrinks at both ends of the series (see the bounded
// average below), so the newest sample -- the live "head" -- always renders its
// exact value with zero lag.
const MAXIMUM_SMOOTHING_RADIUS = 3;

/**
 * Smooths the sparkline line shape without hiding real movement in the data.
 *
 * This is a zero-phase visual de-jitter, not a trend filter: a single symmetric
 * triangular moving average whose window shrinks toward the series boundaries.
 * Because the window collapses to the single newest sample at the right edge,
 * the live head has no lag -- a jump to 100% shows on the current frame, and only
 * its scrolled-back history is smoothed. Zero smoothing returns the raw samples.
 *
 * It deliberately does not blend the raw signal back on top of the smoothed one:
 * that older trick left a sharp "needle" poking out of an otherwise smooth curve.
 * curveMonotoneX already renders the smoothed points without overshoot.
 */
export function smoothSparklineValues(
    values: readonly number[],
    lineSmoothingPercent: number,
): readonly number[] {
    const smoothingRadius = resolveSmoothingRadius(lineSmoothingPercent);

    if (smoothingRadius < 1 || values.length <= 2) {
        return values;
    }

    return applyBoundedTriangularAverage(values, smoothingRadius);
}

function resolveSmoothingRadius(lineSmoothingPercent: number): number {
    const smoothingRatio = clamp(lineSmoothingPercent, 0, 100) / 100;

    return Math.round(smoothingRatio * MAXIMUM_SMOOTHING_RADIUS);
}

function applyBoundedTriangularAverage(values: readonly number[], radius: number): readonly number[] {
    const lastIndex = values.length - 1;

    return values.map((value, valueIndex) => {
        // Shrink the window symmetrically so it never reads past either end. This
        // keeps the average zero-phase (no lead or lag) and, crucially, leaves the
        // newest sample (valueIndex === lastIndex, distance 0) exactly raw while
        // smoothing ramps up over the older samples behind it.
        const effectiveRadius = Math.min(radius, valueIndex, lastIndex - valueIndex);
        if (effectiveRadius === 0) {
            return value;
        }

        let weightedSum = 0;
        let totalWeight = 0;
        for (let offset = -effectiveRadius; offset <= effectiveRadius; offset++) {
            const weight = effectiveRadius + 1 - Math.abs(offset);
            weightedSum += values[valueIndex + offset] * weight;
            totalWeight += weight;
        }

        return weightedSum / totalWeight;
    });
}

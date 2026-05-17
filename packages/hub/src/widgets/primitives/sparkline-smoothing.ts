import { clamp } from "../../view-rendering/svg-utils";

const MAXIMUM_SMOOTHING_RADIUS = 18;
const STRONG_SMOOTHING_THRESHOLD = 0.55;
const VERY_STRONG_SMOOTHING_THRESHOLD = 0.84;
const IMPULSE_SMOOTHING_THRESHOLD = 0.68;

/**
 * Smooths visual sparkline samples without changing the metric data itself.
 * The slider uses a non-linear response so the default "pretty" value removes
 * high-frequency jitter while zero still shows the raw sampled history.
 */
export function smoothSparklineValues(
    values: readonly number[],
    lineSmoothingPercent: number,
): readonly number[] {
    const smoothingStrength = resolveSmoothingStrength(lineSmoothingPercent);

    if (smoothingStrength <= 0 || values.length <= 2) {
        return values;
    }

    const smoothingRatio = resolveSmoothingRatio(lineSmoothingPercent);
    const smoothingRadius = Math.max(1, Math.round(1 + Math.pow(smoothingRatio, 1.35) * MAXIMUM_SMOOTHING_RADIUS));
    const firstPassValues = applyWeightedMovingAverage(values, smoothingRadius);
    const secondPassValues = smoothingStrength >= STRONG_SMOOTHING_THRESHOLD
        ? applyWeightedMovingAverage(firstPassValues, Math.max(1, Math.round(smoothingRadius * 0.72)))
        : firstPassValues;
    const thirdPassValues = smoothingStrength >= VERY_STRONG_SMOOTHING_THRESHOLD
        ? applyWeightedMovingAverage(secondPassValues, Math.max(1, Math.round(smoothingRadius * 0.46)))
        : secondPassValues;
    const filteredValues = smoothingRatio >= IMPULSE_SMOOTHING_THRESHOLD
        ? applyWeightedMovingAverage(thirdPassValues, Math.max(1, Math.round(smoothingRadius * 0.34)))
        : thirdPassValues;
    const rawContribution = resolveRawContribution(smoothingRatio);

    return values.map((value, valueIndex) =>
        value * rawContribution + filteredValues[valueIndex] * (1 - rawContribution)
    );
}

function resolveSmoothingStrength(lineSmoothingPercent: number): number {
    const smoothingRatio = resolveSmoothingRatio(lineSmoothingPercent);

    return Math.pow(smoothingRatio, 0.62);
}

function resolveSmoothingRatio(lineSmoothingPercent: number): number {
    return clamp(lineSmoothingPercent, 0, 100) / 100;
}

function resolveRawContribution(smoothingRatio: number): number {
    if (smoothingRatio >= IMPULSE_SMOOTHING_THRESHOLD) {
        return 0;
    }

    return Math.pow(1 - smoothingRatio / IMPULSE_SMOOTHING_THRESHOLD, 2.4);
}

function applyWeightedMovingAverage(values: readonly number[], radius: number): readonly number[] {
    const averagedValues: number[] = [];

    for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
        let weightedSum = 0;
        let totalWeight = 0;

        for (let offset = -radius; offset <= radius; offset++) {
            const sampleIndex = valueIndex + offset;

            if (sampleIndex < 0 || sampleIndex >= values.length) {
                continue;
            }

            const weight = radius + 1 - Math.abs(offset);
            weightedSum += values[sampleIndex] * weight;
            totalWeight += weight;
        }

        averagedValues.push(totalWeight > 0 ? weightedSum / totalWeight : values[valueIndex]);
    }

    return averagedValues;
}

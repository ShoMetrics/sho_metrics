import type { SparklineScale } from "../../view-rendering/widget-data";

const DEFAULT_FIXED_MINIMUM_VALUE = 0;
const DEFAULT_FIXED_MAXIMUM_VALUE = 100;
const MINIMUM_VISIBLE_RANGE = 1;
const ADAPTIVE_SCALE_HEADROOM_RATIO = 1.18;

export interface SparklineScaleBounds {
    readonly minimumValue: number;
    readonly maximumValue: number;
}

/** Resolves explicit scale intent into safe chart bounds. */
export function resolveSparklineScaleBounds(
    values: readonly number[],
    sparklineScale: SparklineScale | undefined,
): SparklineScaleBounds {
    if (sparklineScale?.mode === "fitToData") {
        return resolveFitToDataScaleBounds(values, sparklineScale.minimumValue);
    }

    // Missing scale metadata must never silently enable fit-to-data behavior.
    // Metric builders should provide their domain maximum; 0..100 is only the
    // deterministic defensive fallback for incomplete renderer data.
    const minimumValue = sparklineScale?.mode === "fixed" && Number.isFinite(sparklineScale.minimumValue)
        ? sparklineScale.minimumValue
        : DEFAULT_FIXED_MINIMUM_VALUE;
    const maximumValue = sparklineScale?.mode === "fixed" && Number.isFinite(sparklineScale.maximumValue)
        ? sparklineScale.maximumValue
        : DEFAULT_FIXED_MAXIMUM_VALUE;

    return {
        minimumValue,
        maximumValue: Math.max(maximumValue, minimumValue + MINIMUM_VISIBLE_RANGE),
    };
}

function resolveFitToDataScaleBounds(
    values: readonly number[],
    configuredMinimumValue: number | undefined,
): SparklineScaleBounds {
    const minimumValue = configuredMinimumValue !== undefined && Number.isFinite(configuredMinimumValue)
        ? configuredMinimumValue
        : Math.min(...values, 0);
    const maximumHistoryValue = Math.max(...values, minimumValue + MINIMUM_VISIBLE_RANGE);
    const maximumValue = minimumValue >= 0
        ? maximumHistoryValue * ADAPTIVE_SCALE_HEADROOM_RATIO
        : maximumHistoryValue;

    return {
        minimumValue,
        maximumValue: Math.max(maximumValue, minimumValue + MINIMUM_VISIBLE_RANGE),
    };
}

/**
 * A single color threshold band.
 * When value falls within [min, max), the associated color is used.
 */
export interface ColorThreshold {
    min: number;
    max: number;
    color: string;
}

export type ColorMode = "solid" | "threshold";

export interface ColorConfig {
    mode: ColorMode;
    solidColor: string;
    thresholds: ColorThreshold[];
    isGradientEnabled: boolean;
}

/**
 * Resolves the renderer paint color for a metric threshold value.
 *
 * In solid mode the threshold value is ignored and the configured solid color
 * is returned. In threshold mode the value is matched against the configured
 * [min, max) bands and the matching band color is returned.
 */
export function resolveColorForThresholdValue(thresholdValue: number, colorConfig: ColorConfig): string {
    if (colorConfig.mode === "solid") {
        return colorConfig.solidColor;
    }
    for (const threshold of colorConfig.thresholds) {
        if (thresholdValue >= threshold.min && thresholdValue < threshold.max) {
            return threshold.color;
        }
    }
    return colorConfig.thresholds[colorConfig.thresholds.length - 1]?.color ?? colorConfig.solidColor;
}

/**
 * Builds SVG gradient stops for a sparkline where each data point
 * may have a different threshold color.
 *
 * Returns an array of { offset (0-1), color } entries with paired stops
 * for sharp color transitions.
 */
export function buildGradientStops(
    values: readonly number[],
    config: ColorConfig,
): Array<{ offset: number; color: string }> {
    if (values.length === 0) {
        return [];
    }

    if (config.mode === "solid" || !config.isGradientEnabled) {
        const color = config.mode === "solid"
            ? config.solidColor
            : resolveColorForThresholdValue(values[values.length - 1] ?? 0, config);

        return [
            { offset: 0, color },
            { offset: 1, color },
        ];
    }

    const stops: Array<{ offset: number; color: string }> = [];
    let previousColor = resolveColorForThresholdValue(values[0], config);
    stops.push({ offset: 0, color: previousColor });

    for (let index = 1; index < values.length; index++) {
        const currentColor = resolveColorForThresholdValue(values[index], config);
        const offset = index / (values.length - 1);

        if (currentColor !== previousColor) {
            // Paired stops at the same offset create a sharp color transition.
            stops.push({ offset, color: previousColor });
            stops.push({ offset, color: currentColor });
            previousColor = currentColor;
        }
    }

    stops.push({ offset: 1, color: previousColor });
    return stops;
}

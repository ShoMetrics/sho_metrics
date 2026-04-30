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
}

/** Default threshold config: green < 50, yellow 50–80, red > 80. */
export const DEFAULT_THRESHOLDS: ColorThreshold[] = [
    { min: 0, max: 50, color: "#22c55e" },
    { min: 50, max: 80, color: "#eab308" },
    { min: 80, max: 101, color: "#ef4444" },
];

export const DEFAULT_COLOR_CONFIG: ColorConfig = {
    mode: "threshold",
    solidColor: "#3b82f6",
    thresholds: DEFAULT_THRESHOLDS,
};

/**
 * Resolve a single color for a given value based on the color config.
 */
export function resolveColor(value: number, config: ColorConfig): string {
    if (config.mode === "solid") {
        return config.solidColor;
    }
    for (const threshold of config.thresholds) {
        if (value >= threshold.min && value < threshold.max) {
            return threshold.color;
        }
    }
    // Fallback: last threshold or solid color
    return config.thresholds[config.thresholds.length - 1]?.color ?? config.solidColor;
}

/**
 * Build SVG gradient stops for a sparkline where each data point
 * may have a different threshold color.
 * Returns an array of { offset (0–1), color } entries with paired stops
 * for sharp color transitions.
 */
export function buildGradientStops(
    values: readonly number[],
    config: ColorConfig,
): Array<{ offset: number; color: string }> {
    if (values.length === 0) return [];
    if (config.mode === "solid") {
        return [
            { offset: 0, color: config.solidColor },
            { offset: 1, color: config.solidColor },
        ];
    }

    const stops: Array<{ offset: number; color: string }> = [];
    let previousColor = resolveColor(values[0], config);
    stops.push({ offset: 0, color: previousColor });

    for (let index = 1; index < values.length; index++) {
        const currentColor = resolveColor(values[index], config);
        const offset = index / (values.length - 1);

        if (currentColor !== previousColor) {
            // Sharp transition: end previous color, start new color at same offset
            stops.push({ offset, color: previousColor });
            stops.push({ offset, color: currentColor });
            previousColor = currentColor;
        }
    }

    stops.push({ offset: 1, color: previousColor });
    return stops;
}

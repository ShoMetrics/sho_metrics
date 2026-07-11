/**
 * A single color threshold band.
 *
 * `min` and `max` are percent-of-maximum bounds (0-100): the same domain as
 * the user-facing low/high threshold percent settings that produce them. Raw
 * source-unit values (bytes, hertz, RPM) must never reach a band lookup
 * directly; byte-scale magnitudes would land past every band and read as
 * permanently "high". When the percent value falls within [min, max), the
 * associated color is used.
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
 * Resolves the renderer paint color for a normalized metric progress (0-1).
 *
 * This is deliberately the only exported single-value threshold lookup. When
 * each call site converted its own value into the band domain, primitives
 * written against percent metrics passed raw `current` values, which worked by
 * coincidence until non-percent metrics flowed through the same primitives.
 * Progress is the one already-normalized input every render surface has, so
 * the domain conversion happens here exactly once. If absolute source-unit
 * thresholds ever become a product feature, extend ColorConfig with an
 * explicit domain marker instead of re-exporting the percent lookup.
 *
 * The parameter is a bare progress fraction rather than WidgetData because
 * not every caller has one: channel view-builders and gauge panels color
 * per-reading fractions that never materialize a WidgetData. Passing a raw
 * source value here is still a caller bug; the clamp bounds the damage to the
 * top band and the primitive smoke test guards the WidgetData-based callers.
 *
 * In solid mode the progress is ignored and the configured solid color is
 * returned. In threshold mode the percent value is matched against the
 * configured [min, max) bands and the matching band color is returned.
 */
export function resolveThresholdColorForProgress(progress: number, colorConfig: ColorConfig): string {
    return resolveColorForThresholdPercent(toThresholdPercent(progress), colorConfig);
}

function resolveColorForThresholdPercent(thresholdPercent: number, colorConfig: ColorConfig): string {
    if (colorConfig.mode === "solid") {
        return colorConfig.solidColor;
    }
    for (const threshold of colorConfig.thresholds) {
        if (thresholdPercent >= threshold.min && thresholdPercent < threshold.max) {
            return threshold.color;
        }
    }
    return colorConfig.thresholds[colorConfig.thresholds.length - 1]?.color ?? colorConfig.solidColor;
}

function toThresholdPercent(progress: number): number {
    if (!Number.isFinite(progress)) {
        return 0;
    }

    return Math.min(Math.max(progress, 0), 1) * 100;
}

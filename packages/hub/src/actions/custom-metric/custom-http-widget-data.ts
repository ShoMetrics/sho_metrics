import { formatCatalogMetricFreshWidgetData } from "../../metrics/catalog-metric-widget-data";
import { formatMetricUnit } from "../../metrics/metric-unit-format";
import type { MetricStoreReader } from "../../runtime/metric-store";
import { MetricUnit } from "../../runtime/sources/metric-source";
import type { MetricValueDisplayHint } from "../../runtime/sources/source-client";
import {
    PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE,
    type WidgetData,
} from "../../view-rendering/widget-data";
import { limitMetricCustomLabelCharacters } from "../../settings/metric-custom-label-policy";

export const CUSTOM_METRIC_DEFAULT_LABEL = "HTTP";

export interface CustomHttpWidgetDataResult {
    readonly widgetData: WidgetData;
    readonly suggestedLucideIconId: string | undefined;
}

/**
 * Reads validated Custom HTTP source output into ordinary widget data.
 *
 * Unit text has three modes: `customUnit` is provider-owned text and bypasses
 * ShoMetrics formatting; known `unit` values use ShoMetrics catalog formatting;
 * missing unit metadata leaves the source value unitless.
 */
export function readCustomHttpWidgetData(options: {
    readonly metrics: MetricStoreReader;
    readonly metricKey: string;
    readonly labelMaximumCharacters?: number | undefined;
    /**
     * Dense rows own row-level labels and maxima, so they override source hints
     * without changing the stored Custom HTTP definition.
     */
    readonly displayOverrides?: {
        readonly label?: string | undefined;
        readonly maximum?: number | undefined;
    } | undefined;
}): CustomHttpWidgetDataResult {
    const readResult = options.metrics.getWidgetDataReadResult(
        options.metricKey,
        options.displayOverrides?.label ?? CUSTOM_METRIC_DEFAULT_LABEL,
        "",
    );
    const displayHint = readResult.valueMetadata?.displayHint;
    const label = resolveCustomHttpLabel(
        displayHint,
        options.labelMaximumCharacters,
        options.displayOverrides?.label,
    );
    const unit = resolveCustomHttpUnitText(displayHint);
    const maximum = options.displayOverrides?.maximum ?? resolveCustomHttpMaximum(displayHint);
    const progress = maximum === undefined
        ? 0
        : Math.min(Math.max(readResult.widgetData.current / maximum, 0), 1);
    const widgetData = {
        ...readResult.widgetData,
        label,
        unit,
        progress,
        ...(maximum === undefined
            ? {}
            : {
                sparklineScale: {
                    mode: "fixed" as const,
                    minimumValue: 0,
                    maximumValue: maximum,
                },
            }),
    };

    if (widgetData.sampleTimestampMilliseconds === undefined) {
        // No timestamp means the source has not produced a usable sample for
        // this metric key yet. Keep the renderer in pending unless the source
        // already reported a concrete unavailable reason.
        return {
            widgetData: {
                ...widgetData,
                unavailableDisplayValue: readResult.unavailableMetric === undefined
                    ? PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE
                    : undefined,
            },
            suggestedLucideIconId: displayHint?.suggestedLucideIconId,
        };
    }

    // Custom unit text is already the user-facing provider unit; catalog
    // formatting is allowed to rewrite unit text only for known ShoMetrics units.
    if (displayHint?.customUnit !== undefined) {
        return {
            widgetData,
            suggestedLucideIconId: displayHint.suggestedLucideIconId,
        };
    }

    return {
        widgetData: displayHint?.unit === undefined
            ? widgetData
            : formatCatalogMetricFreshWidgetData({
                widgetData,
                unit: displayHint.unit,
                category: "other",
            }),
        suggestedLucideIconId: displayHint?.suggestedLucideIconId,
    };
}

function resolveCustomHttpLabel(
    displayHint: MetricValueDisplayHint | undefined,
    labelMaximumCharacters: number | undefined,
    displayOverrideLabel: string | undefined,
): string {
    const trimmedLabel = (displayOverrideLabel ?? displayHint?.label ?? CUSTOM_METRIC_DEFAULT_LABEL).trim();
    const label = trimmedLabel.length === 0 ? CUSTOM_METRIC_DEFAULT_LABEL : trimmedLabel;
    return labelMaximumCharacters === undefined
        ? label
        : limitMetricCustomLabelCharacters(label, labelMaximumCharacters) ?? CUSTOM_METRIC_DEFAULT_LABEL;
}

function resolveCustomHttpUnitText(displayHint: MetricValueDisplayHint | undefined): string {
    if (displayHint?.customUnit !== undefined) {
        return displayHint.customUnit;
    }

    return displayHint?.unit === undefined ? "" : formatMetricUnit(displayHint.unit);
}

function resolveCustomHttpMaximum(displayHint: MetricValueDisplayHint | undefined): number | undefined {
    if (displayHint?.maximum !== undefined) {
        return displayHint.maximum;
    }

    // Percent values naturally use a 0-100 scale unless the transform provides
    // a more specific maximum.
    return displayHint?.unit === MetricUnit.PERCENT ? 100 : undefined;
}

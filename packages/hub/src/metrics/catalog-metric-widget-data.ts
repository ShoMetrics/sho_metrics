import { MetricUnit } from "../runtime/sources/metric-source";
import type { CatalogMetricCategory } from "../settings/resolved-settings";
import type { WidgetData } from "../view-rendering/widget-data";
import { formatByteCount, formatBytesPerSecond } from "./byte-format";
import { formatCompactNumber } from "./compact-number-format";

const BINARY_BASE = 1024;
const SI_BASE = 1000;
const MAXIMUM_DISPLAY_DIGITS = 3;

/**
 * Adds human-readable display text for catalog metrics after helper freshness
 * has already been accepted. Raw value fields stay in source units so progress,
 * history, and scaling keep using the same math as the MetricStore sample.
 */
export function formatCatalogMetricFreshWidgetData(options: {
    readonly widgetData: WidgetData;
    readonly unit: MetricUnit;
    readonly category: CatalogMetricCategory;
}): WidgetData {
    const formattedValue = formatCatalogMetricValue({
        value: options.widgetData.current,
        unit: options.unit,
        category: options.category,
    });

    return formattedValue === undefined
        ? options.widgetData
        : {
            ...options.widgetData,
            displayValue: formattedValue.value,
            unit: formattedValue.unit,
        };
}

function formatCatalogMetricValue(options: {
    readonly value: number;
    readonly unit: MetricUnit;
    readonly category: CatalogMetricCategory;
}): { readonly value: string; readonly unit: string } | undefined {
    const safeValue = Math.max(0, options.value);

    switch (options.unit) {
        case MetricUnit.BYTES:
            // Byte counts are computer capacity values, so use the same
            // binary base as memory and disk-space displays.
            return formatByteCount({
                bytes: safeValue,
                base: BINARY_BASE,
                maximumDisplayDigits: MAXIMUM_DISPLAY_DIGITS,
            });
        case MetricUnit.BYTES_PER_SECOND:
            // Network throughput is normally displayed with decimal MB/s,
            // while storage-style throughput follows the disk binary base.
            return formatBytesPerSecond({
                bytesPerSecond: safeValue,
                unitBase: "byte",
                base: options.category === "network" ? SI_BASE : BINARY_BASE,
                maximumDisplayDigits: MAXIMUM_DISPLAY_DIGITS,
            });
        case MetricUnit.HERTZ:
            return formatHertz(safeValue);
        default:
            return undefined;
    }
}

function formatHertz(hertz: number): { readonly value: string; readonly unit: string } {
    // Frequencies are SI quantities. Keep Hz/KHz/MHz/GHz decimal, and switch
    // between one decimal and integer MHz so three display digits fit compact
    // Stream Deck layouts.
    if (hertz < SI_BASE) {
        return {
            value: formatCompactNumber(hertz, 0, MAXIMUM_DISPLAY_DIGITS),
            unit: "Hz",
        };
    }

    if (hertz < SI_BASE ** 2) {
        return {
            value: formatCompactNumber(hertz / SI_BASE, 0, MAXIMUM_DISPLAY_DIGITS),
            unit: "KHz",
        };
    }

    if (hertz < 100 * SI_BASE ** 2) {
        return {
            value: formatCompactNumber(hertz / (SI_BASE ** 2), 1, MAXIMUM_DISPLAY_DIGITS),
            unit: "MHz",
        };
    }

    if (hertz < SI_BASE ** 3) {
        return {
            value: formatCompactNumber(hertz / (SI_BASE ** 2), 0, MAXIMUM_DISPLAY_DIGITS),
            unit: "MHz",
        };
    }

    return {
        value: formatCompactNumber(hertz / (SI_BASE ** 3), 1, MAXIMUM_DISPLAY_DIGITS),
        unit: "GHz",
    };
}

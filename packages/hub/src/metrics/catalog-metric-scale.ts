import { MetricUnit } from "../runtime/sources/metric-source";
import type { CatalogMetricCategory, CatalogMetricReadingKind } from "../settings/resolved-settings";
import { formatMetricUnit } from "./metric-unit-format";

interface CatalogMetricMaximumInputUnit {
    readonly label: string;
    readonly multiplier: number;
    readonly step: number;
}

const KIBIBYTE = 1024;
const KILOBYTE = 1000;
const GIBIBYTE = KIBIBYTE ** 3;
const MEBIBYTE = KIBIBYTE ** 2;
const DECIMAL_MEGABYTE = KILOBYTE ** 2;
const DECIMAL_GIGAHERTZ = KILOBYTE ** 3;
const FALLBACK_DEFAULT_MAXIMUM_VALUE = 100;
const MAXIMUM_CUSTOM_MAXIMUM_VALUE = 1_000_000_000_000_000;
const RAW_INPUT_MULTIPLIER = 1;
const RAW_INPUT_STEP = 1;

/**
 * Resolves the default raw source-unit maximum for catalog metric scaling.
 *
 * The renderer uses this value for progress math before any display-only unit
 * formatting is applied.
 */
export function resolveCatalogMetricDefaultMaximumValue(
    unit: MetricUnit,
    category: CatalogMetricCategory,
    readingKind: CatalogMetricReadingKind,
): number {
    if (readingKind === "usage") {
        return 100;
    }

    switch (unit) {
        case MetricUnit.PERCENT:
        case MetricUnit.CELSIUS:
            return 100;
        case MetricUnit.VOLTS:
            return 20;
        case MetricUnit.AMPERES:
            return 100;
        case MetricUnit.WATTS:
            return resolvePowerDefaultMaximumValue(category);
        case MetricUnit.HERTZ:
            return resolveClockDefaultMaximumValue(category);
        case MetricUnit.BYTES:
            return resolveBytesDefaultMaximumValue(category);
        case MetricUnit.BYTES_PER_SECOND:
            return resolveThroughputDefaultMaximumValue(category);
        case MetricUnit.REVOLUTIONS_PER_MINUTE:
            return resolveFanDefaultMaximumValue(category);
        case MetricUnit.SECONDS:
            return 60;
        case MetricUnit.MILLISECONDS:
            return 1_000;
        default:
            return FALLBACK_DEFAULT_MAXIMUM_VALUE;
    }
}

export function resolveCatalogMetricMaximumInputLabel(
    unit: MetricUnit,
    category: CatalogMetricCategory,
): string {
    const unitLabel = resolveCatalogMetricMaximumInputUnit(unit, category).label;

    return unitLabel.length === 0 ? "Max" : `Max (${unitLabel})`;
}

export function readCatalogMetricMaximumInputValue(
    rawMaximumValue: number | undefined,
    unit: MetricUnit,
    category: CatalogMetricCategory,
): number | undefined {
    return rawMaximumValue === undefined
        ? undefined
        : rawMaximumValue / resolveCatalogMetricMaximumInputUnit(unit, category).multiplier;
}

export function writeCatalogMetricMaximumInputValue(
    inputValue: number | undefined,
    unit: MetricUnit,
    category: CatalogMetricCategory,
): number | undefined {
    return inputValue === undefined
        ? undefined
        : inputValue * resolveCatalogMetricMaximumInputUnit(unit, category).multiplier;
}

export function resolveCatalogMetricMaximumInputMaximum(
    unit: MetricUnit,
    category: CatalogMetricCategory,
): number {
    // The stored proto limit is raw-unit based. Convert it to the visible PI
    // unit so inputs such as GB, GHz, and MB/s are capped consistently.
    return MAXIMUM_CUSTOM_MAXIMUM_VALUE / resolveCatalogMetricMaximumInputUnit(unit, category).multiplier;
}

export function resolveCatalogMetricMaximumInputStep(
    unit: MetricUnit,
    category: CatalogMetricCategory,
): number {
    return resolveCatalogMetricMaximumInputUnit(unit, category).step;
}

function resolveCatalogMetricMaximumInputUnit(
    unit: MetricUnit,
    category: CatalogMetricCategory,
): CatalogMetricMaximumInputUnit {
    switch (unit) {
        case MetricUnit.HERTZ:
            // Source values are raw hertz. Users edit clocks in GHz.
            return {
                label: "GHz",
                multiplier: DECIMAL_GIGAHERTZ,
                step: 0.1,
            };
        case MetricUnit.BYTES:
            // Source values are raw bytes. Users edit capacity-like values in GB.
            return {
                label: "GB",
                multiplier: GIBIBYTE,
                step: 1,
            };
        case MetricUnit.BYTES_PER_SECOND:
            // Match display defaults: network uses decimal MB/s; storage-like
            // throughput keeps the MB/s label but uses a 1024 base.
            return {
                label: "MB/s",
                multiplier: category === "network" ? DECIMAL_MEGABYTE : MEBIBYTE,
                step: 1,
            };
        default:
            return {
                label: formatMetricUnit(unit),
                multiplier: RAW_INPUT_MULTIPLIER,
                step: RAW_INPUT_STEP,
            };
    }
}

function resolvePowerDefaultMaximumValue(category: CatalogMetricCategory): number {
    switch (category) {
        case "cpu":
            return 250;
        case "gpu":
            return 450;
        default:
            return 300;
    }
}

function resolveClockDefaultMaximumValue(category: CatalogMetricCategory): number {
    switch (category) {
        case "cpu":
            return 6_000_000_000;
        case "gpu":
            return 3_000_000_000;
        default:
            return 5_000_000_000;
    }
}

function resolveBytesDefaultMaximumValue(category: CatalogMetricCategory): number {
    switch (category) {
        case "memory":
            return 64 * GIBIBYTE;
        case "disk":
            return 2 * KIBIBYTE ** 4;
        default:
            return GIBIBYTE;
    }
}

function resolveThroughputDefaultMaximumValue(category: CatalogMetricCategory): number {
    switch (category) {
        case "disk":
            return 1_500 * MEBIBYTE;
        case "network":
            return 125 * DECIMAL_MEGABYTE;
        default:
            return 100 * MEBIBYTE;
    }
}

function resolveFanDefaultMaximumValue(category: CatalogMetricCategory): number {
    switch (category) {
        case "cpu":
            return 4_000;
        case "gpu":
            return 3_500;
        default:
            return 3_000;
    }
}

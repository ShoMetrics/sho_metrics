import type { WidgetData } from "../view-rendering/widget-data";
import { formatByteCount, type FormattedByteValue } from "./byte-format";

const BINARY_BASE = 1024;
const MAXIMUM_CAPACITY_DISPLAY_DIGITS = 3;

type CapacityDisplayMode = "usedCapacity" | "freeCapacity";

/**
 * Builds the shared renderer fields for a used/free capacity reading.
 *
 * Capacity modes change the primary number only. The wide-bar summary remains
 * used/total plus used percentage because bar fill, history, and range colors
 * deliberately keep their established used-capacity semantics.
 */
export function buildCapacityDisplayFields(options: {
    readonly displayMode: CapacityDisplayMode;
    readonly formattedCapacity: FormattedByteValue;
    readonly usedAndTotalText: string;
    readonly usedPercentageText: string;
}): Pick<WidgetData,
    "displayValue" | "unit" | "barWideSecondaryDisplayValue" | "valueQualifierText"
> {
    const isFreeCapacity = options.displayMode === "freeCapacity";

    return {
        displayValue: options.formattedCapacity.value,
        unit: options.formattedCapacity.unit,
        barWideSecondaryDisplayValue: `${options.usedAndTotalText}, ${options.usedPercentageText}% Used`,
        valueQualifierText: isFreeCapacity ? "Free" : "Used",
    };
}

/** Formats a capacity using the same minimum unit as its total. */
export function formatCapacityUsingTotalUnit(bytes: number, totalBytes: number): FormattedByteValue {
    return formatByteCount({
        bytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_CAPACITY_DISPLAY_DIGITS,
        minimumUnitIndex: resolveMinimumCapacityUnitIndex(totalBytes),
    });
}

/** Formats used and total capacities as one compact value pair. */
export function formatUsedAndTotalBytes(usedBytes: number, totalBytes: number): string {
    const minimumUnitIndex = resolveMinimumCapacityUnitIndex(totalBytes);
    const formattedUsedBytes = formatByteCount({
        bytes: usedBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_CAPACITY_DISPLAY_DIGITS,
        minimumUnitIndex,
    });
    const formattedTotalBytes = formatByteCount({
        bytes: totalBytes,
        base: BINARY_BASE,
        maximumDisplayDigits: MAXIMUM_CAPACITY_DISPLAY_DIGITS,
        minimumUnitIndex,
    });
    const usedText = formattedUsedBytes.unit === formattedTotalBytes.unit
        ? formattedUsedBytes.value
        : `${formattedUsedBytes.value} ${formattedUsedBytes.unit}`;

    return `${usedText} / ${formattedTotalBytes.value} ${formattedTotalBytes.unit}`;
}

function resolveMinimumCapacityUnitIndex(totalBytes: number): number {
    return totalBytes >= BINARY_BASE ** 4 ? 4 : 3;
}

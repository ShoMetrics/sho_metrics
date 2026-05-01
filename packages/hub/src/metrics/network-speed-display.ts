import type { WidgetData } from "../rendering/widget-data";

export type NetworkSpeedUnitBase = "byte" | "bit";

export interface NetworkSpeedDisplayOptions {
    bytesPerSecond: number;
    historyBytesPerSecond: readonly number[];
    maximumBytesPerSecond: number;
    label: string;
    unitBase: NetworkSpeedUnitBase;
    maximumDisplayDigits: number;
}

const SI_BASE = 1000;
const BITS_PER_BYTE = 8;
const MINIMUM_PROGRESS_MAXIMUM_BYTES_PER_SECOND = SI_BASE;

export function buildNetworkSpeedWidgetData(options: NetworkSpeedDisplayOptions): WidgetData {
    const safeBytesPerSecond = Math.max(0, options.bytesPerSecond);
    const formattedSpeed = formatNetworkSpeed({
        bytesPerSecond: safeBytesPerSecond,
        unitBase: options.unitBase,
        maximumDisplayDigits: options.maximumDisplayDigits,
    });
    const progressMaximumBytesPerSecond = Math.max(
        options.maximumBytesPerSecond,
        MINIMUM_PROGRESS_MAXIMUM_BYTES_PER_SECOND,
    );

    return {
        current: safeBytesPerSecond,
        progress: Math.min(Math.max(safeBytesPerSecond / progressMaximumBytesPerSecond, 0), 1),
        history: options.historyBytesPerSecond,
        unit: formattedSpeed.unit,
        label: options.label,
        displayValue: formattedSpeed.value,
    };
}

export function convertMegabitsPerSecondToBytesPerSecond(megabitsPerSecond: number): number {
    return (Math.max(0, megabitsPerSecond) * 1_000_000) / BITS_PER_BYTE;
}

function formatNetworkSpeed(options: {
    bytesPerSecond: number;
    unitBase: NetworkSpeedUnitBase;
    maximumDisplayDigits: number;
}): { value: string; unit: string } {
    const unitCharacter = options.unitBase === "byte" ? "B" : "b";
    const unitMultiplier = options.unitBase === "byte" ? 1 : BITS_PER_BYTE;

    if (options.bytesPerSecond < SI_BASE) {
        return { value: "0", unit: `K${unitCharacter}/s` };
    }

    if (options.bytesPerSecond < SI_BASE ** 2) {
        return {
            value: clampDisplayValue((options.bytesPerSecond * unitMultiplier) / SI_BASE, 0, options.maximumDisplayDigits),
            unit: `K${unitCharacter}/s`,
        };
    }

    if (options.bytesPerSecond < 100 * SI_BASE ** 2) {
        return {
            value: clampDisplayValue((options.bytesPerSecond * unitMultiplier) / (SI_BASE ** 2), 1, options.maximumDisplayDigits),
            unit: `M${unitCharacter}/s`,
        };
    }

    if (options.bytesPerSecond < SI_BASE ** 3) {
        return {
            value: clampDisplayValue((options.bytesPerSecond * unitMultiplier) / (SI_BASE ** 2), 0, options.maximumDisplayDigits),
            unit: `M${unitCharacter}/s`,
        };
    }

    return {
        value: clampDisplayValue((options.bytesPerSecond * unitMultiplier) / (SI_BASE ** 3), 1, options.maximumDisplayDigits),
        unit: `G${unitCharacter}/s`,
    };
}

function clampDisplayValue(value: number, fractionDigits: number, maximumDisplayDigits: number): string {
    const formattedValue = value.toFixed(fractionDigits);

    if (countNumericDisplayDigits(formattedValue) <= maximumDisplayDigits) {
        return formattedValue;
    }

    if (fractionDigits > 0) {
        const integerValue = value.toFixed(0);

        if (countNumericDisplayDigits(integerValue) <= maximumDisplayDigits) {
            return integerValue;
        }
    }

    return "9".repeat(maximumDisplayDigits);
}

function countNumericDisplayDigits(value: string): number {
    return value.replace(".", "").length;
}

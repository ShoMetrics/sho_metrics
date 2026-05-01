import { clampDisplayValue } from "./display-number";

export type DataRateUnitBase = "byte" | "bit";

export interface FormattedByteValue {
    value: string;
    unit: string;
}

const BITS_PER_BYTE = 8;
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatByteRate(options: {
    bytesPerSecond: number;
    unitBase: DataRateUnitBase;
    base: number;
    maximumDisplayDigits: number;
}): FormattedByteValue {
    const safeBytesPerSecond = Math.max(0, options.bytesPerSecond);
    const unitCharacter = options.unitBase === "byte" ? "B" : "b";
    const unitMultiplier = options.unitBase === "byte" ? 1 : BITS_PER_BYTE;

    if (safeBytesPerSecond < options.base) {
        return { value: "0", unit: `K${unitCharacter}/s` };
    }

    if (safeBytesPerSecond < options.base ** 2) {
        return {
            value: clampDisplayValue((safeBytesPerSecond * unitMultiplier) / options.base, 0, options.maximumDisplayDigits),
            unit: `K${unitCharacter}/s`,
        };
    }

    if (safeBytesPerSecond < 100 * options.base ** 2) {
        return {
            value: clampDisplayValue(
                (safeBytesPerSecond * unitMultiplier) / (options.base ** 2),
                1,
                options.maximumDisplayDigits,
            ),
            unit: `M${unitCharacter}/s`,
        };
    }

    if (safeBytesPerSecond < options.base ** 3) {
        return {
            value: clampDisplayValue(
                (safeBytesPerSecond * unitMultiplier) / (options.base ** 2),
                0,
                options.maximumDisplayDigits,
            ),
            unit: `M${unitCharacter}/s`,
        };
    }

    return {
        value: clampDisplayValue(
            (safeBytesPerSecond * unitMultiplier) / (options.base ** 3),
            1,
            options.maximumDisplayDigits,
        ),
        unit: `G${unitCharacter}/s`,
    };
}

export function formatBytes(options: {
    bytes: number;
    base: number;
    maximumDisplayDigits: number;
    minimumUnitIndex?: number;
}): FormattedByteValue {
    const safeBytes = Math.max(0, options.bytes);
    const minimumUnitIndex = Math.min(Math.max(options.minimumUnitIndex ?? 0, 0), BYTE_UNITS.length - 1);
    let unitIndex = minimumUnitIndex;

    while (
        unitIndex < BYTE_UNITS.length - 1
        && safeBytes >= options.base ** (unitIndex + 1)
    ) {
        unitIndex += 1;
    }

    const divisor = options.base ** unitIndex;
    const value = divisor > 0 ? safeBytes / divisor : safeBytes;
    const fractionDigits = value < 10 && unitIndex > 0 ? 1 : 0;

    return {
        value: clampDisplayValue(value, fractionDigits, options.maximumDisplayDigits),
        unit: BYTE_UNITS[unitIndex],
    };
}

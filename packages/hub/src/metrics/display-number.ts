export function clampDisplayValue(value: number, fractionDigits: number, maximumDisplayDigits: number): string {
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

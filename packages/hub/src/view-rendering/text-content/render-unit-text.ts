export function formatRenderUnitText(unitText: string): string {
    if (unitText === "C" || unitText === "F") {
        return `°${unitText}`;
    }

    return unitText;
}

export function formatCompactDataRateUnitText(unitText: string): string {
    const trimmedUnitText = unitText.trim();

    if (!isDataRateUnitText(trimmedUnitText)) {
        return unitText;
    }

    return trimmedUnitText.charAt(0).toUpperCase();
}

function isDataRateUnitText(unitText: string): boolean {
    return /^[KMGTPEZY]?B\/S$/u.test(unitText.toUpperCase());
}

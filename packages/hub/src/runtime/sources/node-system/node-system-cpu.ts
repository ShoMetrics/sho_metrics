import type { Systeminformation } from "systeminformation";

export function normalizeNonEmptyText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();

    return normalizedValue && normalizedValue.toUpperCase() !== "N/A"
        ? normalizedValue
        : undefined;
}

export function formatCpuModelText(cpuData: Systeminformation.CpuData): string | null {
    const modelParts = [
        normalizeNonEmptyText(cpuData.manufacturer),
        normalizeNonEmptyText(cpuData.brand),
    ];
    const modelText = modelParts
        .filter((modelPart): modelPart is string => modelPart != null)
        .join(" ")
        .trim();

    return modelText.length > 0 ? modelText : null;
}

export function isFinitePositiveNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

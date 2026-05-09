export function parseRequiredNumberControlValue(value: string): number {
    return Number(value);
}

export function parseOptionalNumberControlValue(value: string): number | undefined {
    return value === "" ? undefined : Number(value);
}

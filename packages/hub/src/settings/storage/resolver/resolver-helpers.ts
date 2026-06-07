
export function resolveStoredEnum<StoredValue extends number, ResolvedValue>(
    storedValue: StoredValue | undefined,
    resolvedValueByStoredValue: Record<StoredValue, ResolvedValue | undefined>,
    defaultValue: ResolvedValue,
): ResolvedValue {
    if (storedValue === undefined) {
        return defaultValue;
    }

    const resolvedValue = resolvedValueByStoredValue[storedValue];
    if (resolvedValue === undefined) {
        return throwUnexpectedStoredSettingsState("Unexpected UNSPECIFIED enum value after protovalidate.");
    }

    return resolvedValue;
}

export function normalizeOptionalText(value: string | undefined): string | undefined {
    const trimmedValue = value?.trim();

    return trimmedValue === ""
        ? undefined
        : trimmedValue;
}

export function resolveStoredPercent(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(Math.max(value, 0), 100);
}

export function throwUnexpectedStoredSettingsState(message: string): never {
    throw new Error(message);
}

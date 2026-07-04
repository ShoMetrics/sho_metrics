
export function resolveProtoEnum<ProtoValue extends number, ResolvedValue>(
    protoValue: ProtoValue | undefined,
    resolvedValueByProtoValue: Record<ProtoValue, ResolvedValue | undefined>,
    defaultValue: ResolvedValue,
): ResolvedValue {
    if (protoValue === undefined) {
        return defaultValue;
    }

    const resolvedValue = resolvedValueByProtoValue[protoValue];
    if (resolvedValue === undefined) {
        return throwUnexpectedStoredSettingsState("Unexpected UNSPECIFIED enum value after protovalidate.");
    }

    return resolvedValue;
}

export function resolveOptionalProtoEnum<ProtoValue extends number, ResolvedValue>(
    protoValue: ProtoValue | undefined,
    resolvedValueByProtoValue: Record<ProtoValue, ResolvedValue | undefined>,
): ResolvedValue | undefined {
    // Optional enum fields are descriptive evidence, not primary settings
    // identity. Unknown future values degrade to absent so old plugins can read
    // newer settings without inventing a misleading local meaning.
    return protoValue === undefined ? undefined : resolvedValueByProtoValue[protoValue];
}

export function normalizeOptionalText(value: string | undefined): string | undefined {
    const trimmedValue = value?.trim();

    return trimmedValue === ""
        ? undefined
        : trimmedValue;
}

export function resolveStoredPercent(value: number | undefined, fallback: number): number {
    // Persisted UI percentages are tolerant on read: older settings, hand edits,
    // or corrupt local storage should not brick the widget. PI controls own the
    // normal range, so this boundary clamps instead of logging every read.
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(Math.max(value, 0), 100);
}

export function throwUnexpectedStoredSettingsState(message: string): never {
    throw new Error(message);
}

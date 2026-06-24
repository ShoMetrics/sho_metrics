import { createHash } from "node:crypto";
import type { ResolvedSystemBluetoothPeripheralIdentifier } from "../../../../settings/resolved-settings";

/**
 * Builds the persisted Bluetooth binding identity from a runtime-only raw identifier.
 */
export function buildBluetoothIdentifier(
    kind: ResolvedSystemBluetoothPeripheralIdentifier["kind"],
    rawIdentifier: string,
): ResolvedSystemBluetoothPeripheralIdentifier {
    // Persisted settings store only the hash; raw Bluetooth addresses, Windows
    // InstanceIds, AEP ids, and macOS accessory identifiers stay inside the
    // runtime source boundary.
    return {
        kind,
        hash: createHash("sha256").update(rawIdentifier).digest("hex"),
    };
}

/**
 * Normalizes platform Bluetooth addresses to the canonical colon-separated form.
 */
export function normalizeBluetoothDeviceAddress(value: unknown): string | undefined {
    const normalizedValue = normalizeNonEmptyText(value)?.replaceAll("-", ":").toLowerCase();
    if (normalizedValue === undefined) {
        return undefined;
    }

    if (/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/u.test(normalizedValue)) {
        return normalizedValue;
    }

    return /^[0-9a-f]{12}$/u.test(normalizedValue)
        ? normalizedValue.replace(/../gu, "$&:").slice(0, -1)
        : undefined;
}

/**
 * Resolves battery values accepted by OS Bluetooth sources into a 0-100 percent value.
 */
export function resolveBluetoothBatteryPercentValue(value: unknown): number | undefined {
    const batteryPercent = typeof value === "string"
        ? Number(value.trim().replace(/%$/u, ""))
        : value;

    return typeof batteryPercent === "number"
        && Number.isFinite(batteryPercent)
        && batteryPercent >= 0
        && batteryPercent <= 100
        ? batteryPercent
        : undefined;
}

/**
 * Normalizes untrusted text fields and treats blank strings as missing.
 */
export function normalizeNonEmptyText(value: unknown): string | undefined {
    const trimmedValue = typeof value === "string" ? value.trim() : undefined;
    return trimmedValue === undefined || trimmedValue.length === 0 ? undefined : trimmedValue;
}

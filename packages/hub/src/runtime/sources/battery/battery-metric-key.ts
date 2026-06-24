import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import { buildVendorHidBatteryPercentMetricKey } from "../../metric-keys";

export function buildBatteryDeviceDescriptorIdFromIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): string {
    return buildStableDescriptorParts(identity).join(".");
}

export function buildBatteryMetricKeyFromIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): string {
    return buildVendorHidBatteryPercentMetricKey(buildBatteryDeviceDescriptorIdFromIdentity(identity));
}

/**
 * Builds the strong per-unit identity used by runtime keys.
 *
 * Route-local fields such as receiver slot, transport, HID interface, usage,
 * and receiver kind must stay out of this key so a persisted binding survives
 * re-pairing or moving the same device between routes.
 */
export function buildBatteryDeviceVendorUnitIdentityKey(
    identity: ResolvedSystemPeripheralIdentity,
): string | undefined {
    if (!hasText(identity.vendorUnitId)) {
        return undefined;
    }

    return stringifyIdentityKey([
        "vendor-unit",
        identity.vendorId ?? null,
        identity.vendorUnitId,
    ]);
}

/**
 * Builds the weak fallback identity used only when no trusted unit id exists.
 *
 * Adapter-provided model ids are treated as opaque compatibility buckets. When
 * absent, exact vendor/product text is the last resort and duplicate matches
 * must remain ambiguous.
 */
export function buildBatteryDeviceFallbackIdentityKey(
    identity: ResolvedSystemPeripheralIdentity,
): string | undefined {
    if (hasText(identity.modelId)) {
        return stringifyIdentityKey([
            "adapter-model-fallback",
            identity.vendorId ?? null,
            identity.modelId,
        ]);
    }

    if (
        identity.vendorId === undefined
        && identity.productId === undefined
        && identity.productName === undefined
    ) {
        return undefined;
    }

    return stringifyIdentityKey([
        "text-model-fallback",
        identity.vendorId ?? null,
        identity.productId ?? null,
        identity.manufacturer ?? "",
        identity.productName ?? "",
    ]);
}

function formatHexIdentityPart(
    prefix: string,
    value: number | undefined,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return `${prefix}-${value.toString(16).padStart(4, "0")}`;
}

function formatTextIdentityParts(
    ...entries: Array<readonly [prefix: string, value: string | undefined]>
): readonly string[] {
    return entries.flatMap(([prefix, value]) => {
        if (value === undefined) {
            return [];
        }

        const normalizedValue = value
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/gu, "-")
            .replace(/-+/gu, "-")
            .replace(/^[-._]+|[-._]+$/gu, "")
            .slice(0, 48)
            .replace(/[-._]+$/gu, "");

        return normalizedValue.length > 0 ? [`${prefix}-${normalizedValue}`] : [];
    });
}

function buildStableDescriptorParts(identity: ResolvedSystemPeripheralIdentity): readonly string[] {
    const vendorPart = formatHexIdentityPart("vendor_id", identity.vendorId);
    const productPart = formatHexIdentityPart("product_id", identity.productId);
    const vendorUnitKey = buildBatteryDeviceVendorUnitIdentityKey(identity);
    if (vendorUnitKey !== undefined) {
        // Product id can be a receiver PID for receiver-backed devices, so it
        // is intentionally excluded from strong binding keys and descriptors.
        return compactDescriptorParts(
            "vendor_unit",
            vendorPart,
            hashIdentityKey(vendorUnitKey),
        );
    }

    if (hasText(identity.modelId)) {
        const modelKey = buildBatteryDeviceFallbackIdentityKey(identity);
        // Adapter model ids are the stable bucket; HID product id may only
        // describe the current route that exposed the device.
        return compactDescriptorParts(
            "model",
            vendorPart,
            hashIdentityKey(modelKey ?? stringifyIdentityKey(["model", identity.modelId])),
        );
    }

    const textFallbackKey = buildBatteryDeviceFallbackIdentityKey(identity);
    return compactDescriptorParts(
        ...formatTextIdentityParts(
            ["manufacturer", identity.manufacturer],
            ["product_name", identity.productName],
        ),
        vendorPart,
        productPart,
        hashIdentityKey(textFallbackKey ?? stringifyIdentityKey(["unknown"])),
    );
}

function compactDescriptorParts(...parts: Array<string | undefined>): readonly string[] {
    const compactedParts = parts.filter(part => part !== undefined);
    return compactedParts.length > 0 ? compactedParts : ["unknown"];
}

function hashIdentityKey(identityKey: string): string {
    return `identity-${fnv1aHex(identityKey, 0x811C9DC5)}${fnv1aHex(identityKey, 0xABC98388)}`;
}

function stringifyIdentityKey(parts: readonly unknown[]): string {
    return JSON.stringify(parts);
}

function hasText(value: string | undefined): value is string {
    return value !== undefined && value.length > 0;
}

/**
 * Builds a deterministic non-cryptographic hash fragment for runtime keys.
 *
 * This stays pure JS instead of using Node crypto because the hash only
 * distinguishes local device identities and is not a security boundary.
 */
function fnv1aHex(value: string, seed: number): string {
    let hash = seed;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

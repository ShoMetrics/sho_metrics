import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import { buildPeripheralBatteryPercentMetricKey } from "../../metric-keys";

export function buildBatteryDeviceDescriptorIdFromIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): string {
    const descriptorParts: string[] = [
        ...formatTextIdentityParts(
            ["manufacturer", identity.manufacturer],
            ["product_name", identity.productName],
        ),
    ];

    const vendorPart = formatHexIdentityPart("vendor_id", identity.vendorId);
    if (vendorPart !== undefined) {
        descriptorParts.push(vendorPart);
    }

    const productPart = formatHexIdentityPart("product_id", identity.productId);
    if (productPart !== undefined) {
        descriptorParts.push(productPart);
    }

    descriptorParts.push(hashPeripheralIdentity(identity));

    return descriptorParts.join(".");
}

export function buildBatteryMetricKeyFromIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): string {
    return buildBatteryMetricKeyFromDescriptorId(buildBatteryDeviceDescriptorIdFromIdentity(identity));
}

export function buildBatteryMetricKeyFromDescriptorId(descriptorId: string): string {
    return buildPeripheralBatteryPercentMetricKey(descriptorId);
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

function hashPeripheralIdentity(identity: ResolvedSystemPeripheralIdentity): string {
    const canonicalIdentity = JSON.stringify([
        identity.vendorId,
        identity.productId,
        identity.manufacturer,
        identity.productName,
        identity.serialNumber,
        identity.interfaceNumber,
        identity.usagePage,
        identity.usageId,
        identity.bindingTransport,
        identity.receiverKind,
        identity.vendorUnitId,
        identity.modelId,
        // Receiver slot is route evidence, not device identity; keep it out of stable runtime keys.
    ]);

    return `${fnv1aHex(canonicalIdentity, 0x811C9DC5)}${fnv1aHex(canonicalIdentity, 0xABC98388)}`;
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

/**
 * OpenLogi-isomorphic inventory policy around HID++ battery probes.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hid/src/inventory.rs`
 * - `crates/openlogi-hid/src/mappings.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

import type {
    OpenLogiDeviceKind,
    OpenLogiHidppProbedFeatures,
} from "./openlogi-hidpp-battery-reader";

export interface OpenLogiDirectProbePolicy {
    readonly isPeripheral: boolean;
    readonly healthy: boolean;
}

export function resolveOpenLogiDeviceKind(input: {
    readonly probedDeviceKind?: OpenLogiDeviceKind;
    readonly registerDeviceKind: OpenLogiDeviceKind;
}): OpenLogiDeviceKind {
    // OpenLogi treats DeviceTypeAndName `0x0005` as more authoritative than the
    // receiver's kind nibble, but keeps the register value as a fallback.
    return input.probedDeviceKind !== undefined && input.probedDeviceKind !== "unknown"
        ? input.probedDeviceKind
        : input.registerDeviceKind;
}

export function settleOpenLogiDirectProbe(probe: OpenLogiHidppProbedFeatures): OpenLogiDirectProbePolicy {
    const walkedFeatureTable = probe.capabilities !== undefined;
    const hasConfigurationFeature = probe.capabilities?.buttons === true ||
        probe.capabilities?.pointer === true ||
        probe.capabilities?.lighting === true;
    // Direct HID++ nodes include receiver secondary interfaces. OpenLogi only
    // promotes a direct node to a peripheral when it exposes battery data or
    // configuration features that real devices have.
    const isPeripheral = probe.battery !== undefined || hasConfigurationFeature;
    return {
        isPeripheral,
        healthy: isPeripheral || walkedFeatureTable,
    };
}

export function buildOpenLogiBoltCacheKey(unitId: readonly number[]): string | undefined {
    // Bolt pairing registers can return an all-zero unit id; OpenLogi treats
    // that as uncacheable instead of creating a key that every such device shares.
    return unitId.length === 4 && unitId.some(value => value !== 0)
        ? `bolt:${formatOpenLogiHexBytes(unitId)}`
        : undefined;
}

export function buildOpenLogiUnifyingCacheKey(input: {
    readonly receiverUid: string;
    readonly receiverSlot: number;
}): string {
    // Unifying does not expose the same per-device unit id here, so cache by the
    // complete receiver uid plus slot rather than the slot alone.
    return `unifying:${input.receiverUid}:${input.receiverSlot}`;
}

export function buildOpenLogiDirectCacheKey(nodeId: string): string {
    // Direct devices are native HID nodes; the enumerator's normalized node key
    // is already scoped to the concrete device path.
    return `direct:${nodeId}`;
}

function formatOpenLogiHexBytes(bytes: readonly number[]): string {
    return bytes
        .map(value => value.toString(16).padStart(2, "0"))
        .join("");
}

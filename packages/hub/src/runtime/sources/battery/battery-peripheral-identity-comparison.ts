import type {
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemPeripheralIdentity,
} from "../../../settings/resolved-settings";
import { buildBatteryMetricKeyFromIdentity } from "./battery-metric-key";

/**
 * Compares identities at the user-selection layer.
 *
 * This deliberately ignores route-local HID fields for vendor HID devices. A
 * user selects a battery target, not the current receiver slot, interface, or
 * usage collection that happened to expose it during discovery.
 */
export function areBatteryPeripheralIdentitiesEquivalentForSelection(
    left: ResolvedSystemPeripheralIdentity,
    right: ResolvedSystemPeripheralIdentity,
): boolean {
    if (left.evidence.kind !== right.evidence.kind) {
        return false;
    }

    switch (left.evidence.kind) {
        case "vendorHid":
            return buildBatteryMetricKeyFromIdentity(left) === buildBatteryMetricKeyFromIdentity(right);
        case "bluetooth":
            return right.evidence.kind === "bluetooth"
                && doBluetoothIdentifiersOverlap(
                    [left.evidence.primaryIdentifier, left.evidence.fallbackIdentifier],
                    [right.evidence.primaryIdentifier, right.evidence.fallbackIdentifier],
                );
    }
}

function doBluetoothIdentifiersOverlap(
    leftIdentifiers: readonly (ResolvedSystemBluetoothPeripheralIdentifier | undefined)[],
    rightIdentifiers: readonly (ResolvedSystemBluetoothPeripheralIdentifier | undefined)[],
): boolean {
    return leftIdentifiers.some(leftIdentifier =>
        rightIdentifiers.some(rightIdentifier => areBluetoothIdentifiersEqual(leftIdentifier, rightIdentifier)));
}

function areBluetoothIdentifiersEqual(
    left: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
    right: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
): boolean {
    return left !== undefined
        && right !== undefined
        && left.kind === right.kind
        && left.hash === right.hash;
}

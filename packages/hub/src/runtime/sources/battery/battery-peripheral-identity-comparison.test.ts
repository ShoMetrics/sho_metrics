import assert from "node:assert/strict";
import { test } from "vitest";
import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import { areBatteryPeripheralIdentitiesEquivalentForSelection } from "./battery-peripheral-identity-comparison";

test("vendor HID selection identity ignores route-local evidence", () => {
    const selectedIdentity = buildVendorHidIdentity({
        receiverSlot: 1,
        interfaceNumber: 1,
        usageId: 1,
        bindingTransport: "usbReceiver",
    });
    const rediscoveredIdentity = buildVendorHidIdentity({
        receiverSlot: 2,
        interfaceNumber: 2,
        usageId: 2,
        bindingTransport: "usbWired",
    });

    assert.equal(
        areBatteryPeripheralIdentitiesEquivalentForSelection(selectedIdentity, rediscoveredIdentity),
        true,
    );
});

test("Bluetooth selection identity matches either primary or fallback identifier", () => {
    const selectedIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: {
                kind: "platformInstanceId",
                hash: "a".repeat(64),
            },
            fallbackIdentifier: {
                kind: "bluetoothDeviceAddress",
                hash: "b".repeat(64),
            },
        },
    };
    const rediscoveredIdentity: ResolvedSystemPeripheralIdentity = {
        evidence: {
            kind: "bluetooth",
            primaryIdentifier: {
                kind: "platformInstanceId",
                hash: "c".repeat(64),
            },
            fallbackIdentifier: {
                kind: "bluetoothDeviceAddress",
                hash: "b".repeat(64),
            },
        },
    };

    assert.equal(
        areBatteryPeripheralIdentitiesEquivalentForSelection(selectedIdentity, rediscoveredIdentity),
        true,
    );
});

function buildVendorHidIdentity(input: {
    readonly receiverSlot: number;
    readonly interfaceNumber: number;
    readonly usageId: number;
    readonly bindingTransport: "usbReceiver" | "usbWired";
}): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "vendorHid",
            vendorId: 0x046D,
            productId: 0xC548,
            manufacturer: "Logitech",
            productName: "MX Master 4",
            serialNumber: undefined,
            interfaceNumber: input.interfaceNumber,
            usagePage: 0xFF00,
            usageId: input.usageId,
            bindingTransport: input.bindingTransport,
            receiverKind: "bolt",
            vendorUnitId: undefined,
            modelId: "logitech:mx-master-4",
            receiverSlot: input.receiverSlot,
        },
    };
}

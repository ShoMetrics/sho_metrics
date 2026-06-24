import assert from "node:assert/strict";
import { test } from "vitest";
import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import { VendorHidBatteryRouteRegistry } from "./vendor-hid-battery-route-registry";

test("vendor HID battery route registry stores and removes selected route definitions by metric key", () => {
    const registry = new VendorHidBatteryRouteRegistry();
    const identity = buildTestIdentity();

    registry.register({
        metricKey: "battery.vendor_id-test",
        identity,
        ownerId: "action-1",
    });

    assert.deepEqual(registry.read("battery.vendor_id-test"), {
        metricKey: "battery.vendor_id-test",
        identity,
    });

    registry.unregister("battery.vendor_id-test", "action-1");

    assert.equal(registry.read("battery.vendor_id-test"), undefined);
});

test("vendor HID battery route registry keeps shared metric keys until the last owner unregisters", () => {
    const registry = new VendorHidBatteryRouteRegistry();
    const identity = buildTestIdentity();

    registry.register({
        metricKey: "battery.vendor_id-test",
        identity,
        ownerId: "action-1",
    });
    registry.register({
        metricKey: "battery.vendor_id-test",
        identity,
        ownerId: "action-2",
    });

    registry.unregister("battery.vendor_id-test", "action-1");

    assert.deepEqual(registry.read("battery.vendor_id-test"), {
        metricKey: "battery.vendor_id-test",
        identity,
    });

    registry.unregister("battery.vendor_id-test", "action-2");

    assert.equal(registry.read("battery.vendor_id-test"), undefined);
});

function buildTestIdentity(): ResolvedSystemPeripheralIdentity {
    return {
        vendorId: 0x046D,
        productId: 0xC548,
        manufacturer: "Logitech",
        productName: "Test Mouse",
        serialNumber: undefined,
        interfaceNumber: 2,
        usagePage: 0xFF00,
        usageId: undefined,
        bindingTransport: "usbReceiver",
        receiverKind: "bolt",
        vendorUnitId: "unit-test",
        modelId: "test-mouse",
        receiverSlot: 1,
    };
}

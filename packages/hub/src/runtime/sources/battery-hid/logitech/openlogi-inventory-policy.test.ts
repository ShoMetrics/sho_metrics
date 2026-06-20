import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenLogiBoltCacheKey,
    buildOpenLogiDirectCacheKey,
    buildOpenLogiUnifyingCacheKey,
    resolveOpenLogiDeviceKind,
    settleOpenLogiDirectProbe,
} from "./openlogi-inventory-policy";

test("OpenLogi device kind resolution trusts probed 0x0005 before receiver register kind", () => {
    assert.equal(resolveOpenLogiDeviceKind({
        probedDeviceKind: "mouse",
        registerDeviceKind: "keyboard",
    }), "mouse");
    assert.equal(resolveOpenLogiDeviceKind({
        registerDeviceKind: "mouse",
    }), "mouse");
    assert.equal(resolveOpenLogiDeviceKind({
        probedDeviceKind: "unknown",
        registerDeviceKind: "keyboard",
    }), "keyboard");
});

test("OpenLogi direct probe accepts battery or configuration features as a peripheral", () => {
    assert.deepEqual(settleOpenLogiDirectProbe({
        battery: {
            percentage: 50,
            level: "good",
            status: "discharging",
        },
        capabilities: {
            buttons: false,
            pointer: false,
            lighting: false,
        },
    }), {
        isPeripheral: true,
        healthy: true,
    });
    assert.deepEqual(settleOpenLogiDirectProbe({
        capabilities: {
            buttons: false,
            pointer: true,
            lighting: false,
        },
    }), {
        isPeripheral: true,
        healthy: true,
    });
});

test("OpenLogi direct probe skips receiver secondary interfaces only after a completed feature walk", () => {
    assert.deepEqual(settleOpenLogiDirectProbe({
        capabilities: {
            buttons: false,
            pointer: false,
            lighting: false,
        },
    }), {
        isPeripheral: false,
        healthy: true,
    });
    assert.deepEqual(settleOpenLogiDirectProbe({}), {
        isPeripheral: false,
        healthy: false,
    });
});

test("OpenLogi cache keys mirror Bolt unit, Unifying slot, and direct node identity", () => {
    assert.equal(buildOpenLogiBoltCacheKey([0x12, 0x34, 0x56, 0x78]), "bolt:12345678");
    assert.equal(buildOpenLogiBoltCacheKey([0x00, 0x00, 0x00, 0x00]), undefined);
    assert.equal(buildOpenLogiUnifyingCacheKey({
        receiverUid: "DA2699E1",
        receiverSlot: 2,
    }), "unifying:DA2699E1:2");
    assert.equal(buildOpenLogiDirectCacheKey("hid-node-1"), "direct:hid-node-1");
});

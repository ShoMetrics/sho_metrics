import assert from "node:assert/strict";
import test from "node:test";
import {
    assembleOpenLogiBoltPairedDevice,
    assembleOpenLogiDirectDevice,
    assembleOpenLogiUnifyingPairedDevice,
    buildOpenLogiUnifyingReceiverUidFallback,
    isOpenLogiBoltReceiverProbeComplete,
    isOpenLogiUnifyingReceiverProbeHealthy,
} from "./openlogi-receiver-inventory";

test("OpenLogi Bolt slot assembly prefers live arrival data over pairing-register hints", () => {
    const assembled = assembleOpenLogiBoltPairedDevice({
        receiverSlot: 2,
        pairingInformation: {
            wirelessProductId: 0x1111,
            deviceKind: "keyboard",
            encrypted: true,
            online: false,
            unitId: [0xAA, 0xBB, 0xCC, 0xDD],
        },
        arrivalEvent: {
            receiverSlot: 2,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            wirelessProductId: 0x1234,
        },
        codename: "MX Anywhere 3",
        probe: {
            deviceKind: "trackball",
            battery: {
                percentage: 90,
                level: "full",
                status: "discharging",
            },
        },
    });

    assert.deepEqual(assembled, {
        pairedDevice: {
            receiverSlot: 2,
            codename: "MX Anywhere 3",
            wirelessProductId: 0x1234,
            deviceKind: "trackball",
            online: true,
            battery: {
                percentage: 90,
                level: "full",
                status: "discharging",
            },
        },
        cacheKey: "bolt:aabbccdd",
        registerDeviceKind: "mouse",
    });
});

test("OpenLogi direct assembly surfaces peripherals and filters receiver secondary interfaces", () => {
    assert.deepEqual(assembleOpenLogiDirectDevice({
        nodeId: "node-1",
        name: "G502 X",
        vendorId: 0x046D,
        productId: 0xC094,
        probe: {
            deviceKind: "mouse",
            battery: {
                percentage: 70,
                level: "good",
                status: "discharging",
            },
            capabilities: {
                buttons: false,
                pointer: false,
                lighting: false,
            },
        },
    }), {
        cacheKey: "direct:node-1",
        healthy: true,
        inventory: {
            receiver: {
                name: "G502 X",
                vendorId: 0x046D,
                productId: 0xC094,
            },
            pairedDevices: [{
                receiverSlot: 0xFF,
                codename: "G502 X",
                deviceKind: "mouse",
                online: true,
                battery: {
                    percentage: 70,
                    level: "good",
                    status: "discharging",
                },
                capabilities: {
                    buttons: false,
                    pointer: false,
                    lighting: false,
                },
            }],
        },
    });

    assert.deepEqual(assembleOpenLogiDirectDevice({
        nodeId: "receiver-secondary",
        name: "Logi Bolt Receiver",
        vendorId: 0x046D,
        productId: 0xC548,
        probe: {
            capabilities: {
                buttons: false,
                pointer: false,
                lighting: false,
            },
        },
    }), {
        cacheKey: "direct:receiver-secondary",
        healthy: true,
    });
});

test("OpenLogi Bolt slot assembly falls back to pairing register when no event or probe kind exists", () => {
    const assembled = assembleOpenLogiBoltPairedDevice({
        receiverSlot: 3,
        pairingInformation: {
            wirelessProductId: 0x9999,
            deviceKind: "mouse",
            encrypted: false,
            online: false,
            unitId: [0x00, 0x00, 0x00, 0x00],
        },
        probe: {},
    });

    assert.deepEqual(assembled, {
        pairedDevice: {
            receiverSlot: 3,
            deviceKind: "mouse",
            online: false,
        },
        registerDeviceKind: "mouse",
    });
});

test("OpenLogi Unifying assembly uses receiver uid and slot as cache identity", () => {
    const assembled = assembleOpenLogiUnifyingPairedDevice({
        receiverUid: "DEADBEEF",
        arrivalEvent: {
            receiverSlot: 1,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            wirelessProductId: 0x4069,
        },
        codename: "MX Master 3",
        probe: {
            deviceKind: "unknown",
            capabilities: {
                buttons: true,
                pointer: true,
                lighting: false,
            },
        },
    });

    assert.deepEqual(assembled, {
        pairedDevice: {
            receiverSlot: 1,
            codename: "MX Master 3",
            wirelessProductId: 0x4069,
            deviceKind: "mouse",
            online: true,
            capabilities: {
                buttons: true,
                pointer: true,
                lighting: false,
            },
        },
        cacheKey: "unifying:DEADBEEF:1",
        registerDeviceKind: "mouse",
    });
});

test("OpenLogi receiver health and completeness rules match inventory comments", () => {
    assert.equal(isOpenLogiBoltReceiverProbeComplete({
        pairingCount: 2,
        pairedDeviceCount: 2,
    }), true);
    assert.equal(isOpenLogiBoltReceiverProbeComplete({
        pairingCount: 2,
        pairedDeviceCount: 1,
    }), false);
    assert.equal(isOpenLogiBoltReceiverProbeComplete({
        pairedDeviceCount: 0,
    }), false);

    assert.equal(isOpenLogiUnifyingReceiverProbeHealthy({ pairingCount: 0 }), true);
    assert.equal(isOpenLogiUnifyingReceiverProbeHealthy({ pairingCount: undefined }), false);
    assert.equal(buildOpenLogiUnifyingReceiverUidFallback(0xC52B), "pid:c52b");
});

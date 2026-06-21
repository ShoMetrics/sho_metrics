import assert from "node:assert/strict";
import test from "node:test";
import {
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "../../logitech-hidpp-frame";
import {
    parseOpenLogiBoltDeviceConnectionEvent,
    parseOpenLogiBoltDevicePairingInformation,
} from "./bolt";
import {
    parseOpenLogiUnifyingDeviceConnectionEvent,
} from "./unifying";

test("OpenLogi Bolt pairing information parser preserves flag semantics", () => {
    assert.deepEqual(parseOpenLogiBoltDevicePairingInformation([
        0x52,
        0x22,
        0x34,
        0x12,
        0xAA,
        0xBB,
        0xCC,
        0xDD,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ]), {
        state: "pairingInformation",
        pairingInformation: {
            wirelessProductId: 0x1234,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            unitId: "aabbccdd",
        },
    });
});

test("OpenLogi Bolt rejects Unifying-only kind values", () => {
    const payload = [
        0x51,
        0x15,
        0x78,
        0x56,
        0x01,
        0x02,
        0x03,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ];

    assert.deepEqual(parseOpenLogiBoltDevicePairingInformation(payload), {
        state: "unsupported",
        rawKind: 0x05,
    });
});

test("OpenLogi receiver device-connection parsers preserve receiver-specific flags", () => {
    assert.deepEqual(parseOpenLogiBoltDeviceConnectionEvent([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0x02,
        0x41,
        0x00,
        0x22,
        0x34,
        0x12,
    ]), {
        state: "deviceConnection",
        connection: {
            receiverSlot: 0x02,
            deviceKind: "mouse",
            encrypted: true,
            online: true,
            wirelessProductId: 0x1234,
        },
    });
    assert.deepEqual(parseOpenLogiUnifyingDeviceConnectionEvent([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0x03,
        0x41,
        0x00,
        0x46,
        0xEF,
        0xCD,
    ]), {
        state: "deviceConnection",
        connection: {
            receiverSlot: 0x03,
            deviceKind: "trackball",
            encrypted: false,
            online: false,
            wirelessProductId: 0xCDEF,
        },
    });
});

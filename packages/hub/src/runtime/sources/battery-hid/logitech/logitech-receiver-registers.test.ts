import assert from "node:assert/strict";
import test from "node:test";
import {
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./hidpp-protocol";
import {
    LOGITECH_RECEIVER_DEVICE_SLOT,
    buildLogitechDevicePairingInformationRequest,
    buildLogitechTriggerDeviceArrivalRequest,
    parseLogitechReceiverDeviceConnectionEvent,
    parseLogitechReceiverPairingInformation,
    parseLogitechReceiverRegisterResponse,
} from "./logitech-receiver-registers";

test("Logitech receiver register builders keep HID++1.0 RAP request framing", () => {
    assert.deepEqual(buildLogitechTriggerDeviceArrivalRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        LOGITECH_RECEIVER_DEVICE_SLOT,
        0x80,
        0x02,
        0x02,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildLogitechDevicePairingInformationRequest(2).bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        LOGITECH_RECEIVER_DEVICE_SLOT,
        0x83,
        0xB5,
        0x52,
        0x00,
        0x00,
    ]);
});

test("Logitech receiver register parser strips the echoed register address", () => {
    const request = buildLogitechTriggerDeviceArrivalRequest();

    assert.deepEqual(parseLogitechReceiverRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        LOGITECH_RECEIVER_DEVICE_SLOT,
        0x80,
        0x02,
        0x00,
        0x00,
        0x00,
    ], request), {
        state: "register",
        payload: [0x00, 0x00, 0x00],
    });
});

test("Logitech receiver register parser keeps device errors separate from unrelated reports", () => {
    const request = buildLogitechTriggerDeviceArrivalRequest();

    assert.deepEqual(parseLogitechReceiverRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        LOGITECH_RECEIVER_DEVICE_SLOT,
        0x8F,
        0x80,
        0x02,
        0x08,
        0x00,
    ], request), {
        state: "registerError",
        errorCode: 0x08,
    });
    assert.deepEqual(parseLogitechReceiverRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0x01,
        0x80,
        0x02,
        0x00,
        0x00,
        0x00,
    ], request), { state: "unrelated" });
});

test("Logitech pairing information parser preserves Bolt flag semantics", () => {
    assert.deepEqual(parseLogitechReceiverPairingInformation("bolt", [
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

test("Logitech pairing information parser keeps Unifying and Bolt kind tables distinct", () => {
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

    assert.deepEqual(parseLogitechReceiverPairingInformation("unifying", payload), {
        state: "pairingInformation",
        pairingInformation: {
            wirelessProductId: 0x5678,
            deviceKind: "remote",
            encrypted: true,
            online: true,
            unitId: "01020304",
        },
    });
    assert.deepEqual(parseLogitechReceiverPairingInformation("bolt", payload), {
        state: "unsupported",
        rawKind: 0x05,
    });
});

test("Logitech receiver device-connection parser preserves receiver-specific flag semantics", () => {
    assert.deepEqual(parseLogitechReceiverDeviceConnectionEvent("bolt", [
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
    assert.deepEqual(parseLogitechReceiverDeviceConnectionEvent("unifying", [
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

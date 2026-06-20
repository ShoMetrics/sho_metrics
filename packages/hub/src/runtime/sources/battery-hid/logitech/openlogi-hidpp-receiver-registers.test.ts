import assert from "node:assert/strict";
import test from "node:test";
import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./hidpp-protocol";
import {
    OPENLOGI_RECEIVER_DEVICE_INDEX,
    buildOpenLogiBoltReceiverUniqueIdRequest,
    buildOpenLogiDeviceCodenameRequest,
    buildOpenLogiDevicePairingInformationRequest,
    buildOpenLogiPairingCountRequest,
    buildOpenLogiReadLongRegisterRequest,
    buildOpenLogiReadRegisterRequest,
    buildOpenLogiTriggerDeviceArrivalRequest,
    buildOpenLogiUnifyingReceiverInfoRequest,
    buildOpenLogiWriteLongRegisterRequest,
    parseOpenLogiBoltReceiverUniqueId,
    parseOpenLogiDeviceCodename,
    parseOpenLogiPairingCount,
    parseOpenLogiReceiverDeviceConnectionEvent,
    parseOpenLogiReceiverPairingInformation,
    parseOpenLogiRegisterResponse,
    parseOpenLogiUnifyingReceiverInfo,
} from "./openlogi-hidpp-receiver-registers";

test("OpenLogi HID++1.0 register builders mirror RAP request framing", () => {
    assert.deepEqual(buildOpenLogiReadRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: 0x02,
        parameters: [0x00, 0x00, 0x00],
    }).bytes, [LOGITECH_HIDPP_SHORT_REPORT_ID, 0xFF, 0x81, 0x02, 0x00, 0x00, 0x00]);

    assert.deepEqual(buildOpenLogiReadLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: 0xB5,
        parameters: [0x52, 0x00, 0x00],
    }).bytes, [LOGITECH_HIDPP_SHORT_REPORT_ID, 0xFF, 0x83, 0xB5, 0x52, 0x00, 0x00]);

    assert.deepEqual(buildOpenLogiTriggerDeviceArrivalRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x80,
        0x02,
        0x02,
        0x00,
        0x00,
    ]);
});

test("OpenLogi long-register write builder pads 16-byte payloads", () => {
    assert.deepEqual(buildOpenLogiWriteLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: 0xC1,
        payload: [0x03, 0x02],
    }).bytes, [
        LOGITECH_HIDPP_LONG_REPORT_ID,
        0xFF,
        0x82,
        0xC1,
        0x03,
        0x02,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ]);
});

test("OpenLogi receiver convenience builders use the same registers as the reference", () => {
    assert.deepEqual(buildOpenLogiPairingCountRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x81,
        0x02,
        0x00,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildOpenLogiBoltReceiverUniqueIdRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x83,
        0xFB,
        0x00,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildOpenLogiUnifyingReceiverInfoRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x83,
        0xB5,
        0x03,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildOpenLogiDevicePairingInformationRequest(2).bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x83,
        0xB5,
        0x52,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildOpenLogiDeviceCodenameRequest(2).bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x83,
        0xB5,
        0x62,
        0x01,
        0x00,
    ]);
});

test("OpenLogi register response parser strips echoed register address", () => {
    const request = buildOpenLogiPairingCountRequest();

    assert.deepEqual(parseOpenLogiRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x81,
        0x02,
        0x00,
        0x06,
        0x00,
    ], request), {
        state: "register",
        payload: [0x00, 0x06, 0x00],
    });
});

test("OpenLogi register response parser keeps register errors as access failures", () => {
    const request = buildOpenLogiPairingCountRequest();

    assert.deepEqual(parseOpenLogiRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x8F,
        0x81,
        0x02,
        0x08,
        0x00,
    ], request), {
        state: "registerError",
        errorCode: 0x08,
    });
});

test("OpenLogi register response parser rejects unrelated and malformed reports", () => {
    const request = buildOpenLogiPairingCountRequest();

    assert.deepEqual(parseOpenLogiRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0x01,
        0x81,
        0x02,
        0x00,
        0x06,
        0x00,
    ], request), { state: "unrelated" });
    assert.deepEqual(parseOpenLogiRegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0xFF,
        0x81,
    ], request), { state: "malformed" });
});

test("OpenLogi receiver scalar parsers mirror register payload offsets", () => {
    assert.equal(parseOpenLogiPairingCount([0x00, 0x06, 0x00]), 0x06);
    assert.equal(parseOpenLogiBoltReceiverUniqueId([...Buffer.from("ABCDEF1234567890", "utf8")]), "ABCDEF1234567890");
    assert.deepEqual(parseOpenLogiUnifyingReceiverInfo([
        0x03,
        0xDE,
        0xAD,
        0xBE,
        0xEF,
        0x00,
        0x06,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ]), {
        serialNumber: "DEADBEEF",
        pairingSlots: 0x06,
    });
});

test("OpenLogi pairing information parser preserves Bolt flag semantics", () => {
    assert.deepEqual(parseOpenLogiReceiverPairingInformation("bolt", [
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
            unitId: [0xAA, 0xBB, 0xCC, 0xDD],
        },
    });
});

test("OpenLogi pairing information parser keeps Unifying kind table distinct from Bolt", () => {
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

    assert.deepEqual(parseOpenLogiReceiverPairingInformation("unifying", payload), {
        state: "pairingInformation",
        pairingInformation: {
            wirelessProductId: 0x5678,
            deviceKind: "remote",
            encrypted: true,
            online: true,
            unitId: [0x01, 0x02, 0x03, 0x04],
        },
    });
    assert.deepEqual(parseOpenLogiReceiverPairingInformation("bolt", payload), {
        state: "unsupported",
        rawKind: 0x05,
    });
});

test("OpenLogi pairing information parser maps receiver-specific device-kind tables", () => {
    const expectedCommonKinds = [
        [0x00, "unknown"],
        [0x01, "keyboard"],
        [0x02, "mouse"],
        [0x03, "numpad"],
        [0x04, "presenter"],
    ] as const;
    const expectedBoltSpecificKinds = [
        [0x07, "remote"],
        [0x08, "trackball"],
        [0x09, "touchpad"],
        [0x0A, "tablet"],
        [0x0B, "gamepad"],
        [0x0C, "joystick"],
        [0x0D, "headset"],
    ] as const;
    const expectedUnifyingSpecificKinds = [
        [0x05, "remote"],
        [0x06, "trackball"],
        [0x07, "touchpad"],
    ] as const;

    for (const [rawKind, deviceKind] of [
        ...expectedCommonKinds,
        ...expectedBoltSpecificKinds,
    ]) {
        const parsedPairingInformation = parseOpenLogiReceiverPairingInformation(
            "bolt",
            pairingInformationPayload(rawKind),
        );
        assert.equal(parsedPairingInformation.state, "pairingInformation");
        assert.equal(parsedPairingInformation.pairingInformation.deviceKind, deviceKind);
    }

    for (const [rawKind, deviceKind] of [
        ...expectedCommonKinds,
        ...expectedUnifyingSpecificKinds,
    ]) {
        const parsedPairingInformation = parseOpenLogiReceiverPairingInformation(
            "unifying",
            pairingInformationPayload(rawKind),
        );
        assert.equal(parsedPairingInformation.state, "pairingInformation");
        assert.equal(parsedPairingInformation.pairingInformation.deviceKind, deviceKind);
    }

    for (const unsupportedUnifyingKind of [0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E]) {
        assert.deepEqual(parseOpenLogiReceiverPairingInformation(
            "unifying",
            pairingInformationPayload(unsupportedUnifyingKind),
        ), {
            state: "unsupported",
            rawKind: unsupportedUnifyingKind,
        });
    }
});

test("OpenLogi codename parser clamps one long-register chunk and rejects invalid UTF-8", () => {
    const payload = new Array(16).fill(0x00) as number[];
    payload[2] = 200;
    payload.splice(3, 13, ...Buffer.from("MX Anywhere 3", "utf8"));
    assert.equal(parseOpenLogiDeviceCodename(payload), "MX Anywhere 3");

    const invalidPayload = new Array(16).fill(0x00) as number[];
    invalidPayload[2] = 2;
    invalidPayload[3] = 0xFF;
    invalidPayload[4] = 0xFE;
    assert.equal(parseOpenLogiDeviceCodename(invalidPayload), undefined);
});

test("OpenLogi device-connection parser preserves receiver-specific flag semantics", () => {
    assert.deepEqual(parseOpenLogiReceiverDeviceConnectionEvent("bolt", [
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
    assert.deepEqual(parseOpenLogiReceiverDeviceConnectionEvent("unifying", [
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

function pairingInformationPayload(rawKind: number): readonly number[] {
    return [
        0x52,
        rawKind,
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
    ];
}

import assert from "node:assert/strict";
import { test } from "vitest";
import {
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "../../logitech-hidpp-frame";
import {
    buildOpenLogiHidpp10GetLongRegisterRequest,
    parseOpenLogiHidpp10RegisterResponse,
} from "./v10";
import { OPENLOGI_RECEIVER_DEVICE_INDEX } from "../receiver/mod";
import { buildOpenLogiTriggerDeviceArrivalRequest } from "../hid/inventory";

test("OpenLogi HID++1.0 builders keep RAP request framing", () => {
    assert.deepEqual(buildOpenLogiTriggerDeviceArrivalRequest().bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        OPENLOGI_RECEIVER_DEVICE_INDEX,
        0x80,
        0x02,
        0x02,
        0x00,
        0x00,
    ]);
    assert.deepEqual(buildOpenLogiHidpp10GetLongRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: 0xB5,
        parameters: [0x52, 0x00, 0x00],
    }).bytes, [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        OPENLOGI_RECEIVER_DEVICE_INDEX,
        0x83,
        0xB5,
        0x52,
        0x00,
        0x00,
    ]);
});

test("OpenLogi HID++1.0 parser strips the echoed register address", () => {
    const request = buildOpenLogiTriggerDeviceArrivalRequest();

    assert.deepEqual(parseOpenLogiHidpp10RegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        OPENLOGI_RECEIVER_DEVICE_INDEX,
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

test("OpenLogi HID++1.0 parser keeps device errors separate from unrelated reports", () => {
    const request = buildOpenLogiTriggerDeviceArrivalRequest();

    assert.deepEqual(parseOpenLogiHidpp10RegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        OPENLOGI_RECEIVER_DEVICE_INDEX,
        0x8F,
        0x80,
        0x02,
        0x08,
        0x00,
    ], request), {
        state: "registerError",
        errorCode: 0x08,
    });
    assert.deepEqual(parseOpenLogiHidpp10RegisterResponse([
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        0x01,
        0x80,
        0x02,
        0x00,
        0x00,
        0x00,
    ], request), { state: "unrelated" });
});

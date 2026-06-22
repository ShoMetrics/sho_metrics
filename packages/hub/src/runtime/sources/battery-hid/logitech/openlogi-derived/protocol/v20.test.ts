import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildOpenLogiHidpp20ShortMessagePayload,
    buildOpenLogiHidpp20ShortReportBytes,
    combineOpenLogiHidpp20Nibbles,
    matchesOpenLogiHidpp20ResponseHeader,
    OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX,
    parseOpenLogiHidpp20MessageHeader,
    readOpenLogiHidpp20FeatureErrorCode,
} from "./v20";

test("OpenLogi HID++2 combines function and software nibbles", () => {
    assert.equal(combineOpenLogiHidpp20Nibbles(0x0A, 0x0B), 0xAB);
    assert.equal(combineOpenLogiHidpp20Nibbles(0x1A, 0x2B), 0xAB);
});

test("OpenLogi HID++2 short message framing uses device feature and function bytes", () => {
    const header = {
        deviceIndex: 0x02,
        featureIndex: 0x09,
        functionId: 0x01,
        softwareId: 0x01,
    };

    assert.deepEqual(
        buildOpenLogiHidpp20ShortMessagePayload({
            header,
            payload: [0x10, 0x04],
        }),
        [0x02, 0x09, 0x11, 0x10, 0x04, 0x00],
    );
    assert.deepEqual(
        buildOpenLogiHidpp20ShortReportBytes({
            header,
            payload: [0x10, 0x04],
        }),
        [0x10, 0x02, 0x09, 0x11, 0x10, 0x04, 0x00],
    );
});

test("OpenLogi HID++2 parses message headers from report-id-excluded bytes", () => {
    assert.deepEqual(parseOpenLogiHidpp20MessageHeader([0x02, 0x09, 0x11, 0x5A]), {
        deviceIndex: 0x02,
        featureIndex: 0x09,
        functionId: 0x01,
        softwareId: 0x01,
    });
    assert.equal(parseOpenLogiHidpp20MessageHeader([0x02, 0x09]), undefined);
});

test("OpenLogi HID++2 matches feature errors against the original request header", () => {
    const requestHeader = {
        deviceIndex: 0x02,
        featureIndex: 0x09,
        functionId: 0x01,
        softwareId: 0x01,
    };
    const responseHeader = {
        deviceIndex: 0x02,
        featureIndex: OPENLOGI_HIDPP20_ERROR_FEATURE_INDEX,
        functionId: 0x00,
        softwareId: 0x09,
    };

    assert.equal(
        matchesOpenLogiHidpp20ResponseHeader({
            requestHeader,
            responseHeader,
            responsePayload: [0x11, 0x07],
        }),
        true,
    );
    assert.equal(readOpenLogiHidpp20FeatureErrorCode([0x11, 0x07]), 0x07);
});

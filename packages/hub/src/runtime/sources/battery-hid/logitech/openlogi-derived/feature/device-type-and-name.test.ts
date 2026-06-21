import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenLogiDeviceNameChunkRequestPayload,
    buildOpenLogiDeviceNameCountRequestPayload,
    buildOpenLogiDeviceTypeRequestPayload,
    parseOpenLogiDeviceNameChunkPayload,
    parseOpenLogiDeviceNameCountPayload,
    parseOpenLogiDeviceType,
    parseOpenLogiDeviceTypePayload,
} from "./device-type-and-name";

test("OpenLogi DeviceTypeAndName name count request uses zero padding", () => {
    assert.deepEqual(buildOpenLogiDeviceNameCountRequestPayload(), [0x00, 0x00, 0x00]);
});

test("OpenLogi DeviceTypeAndName name count parser reads the first byte", () => {
    assert.equal(parseOpenLogiDeviceNameCountPayload([0x0D, 0x00, 0x00]), 13);
    assert.equal(parseOpenLogiDeviceNameCountPayload([]), 0);
});

test("OpenLogi DeviceTypeAndName name chunk request uses the start index plus padding", () => {
    assert.deepEqual(buildOpenLogiDeviceNameChunkRequestPayload(0x10), [0x10, 0x00, 0x00]);
});

test("OpenLogi DeviceTypeAndName name chunk parser returns the response payload bytes", () => {
    assert.deepEqual(parseOpenLogiDeviceNameChunkPayload([0x4D, 0x58, 0x20]), [0x4D, 0x58, 0x20]);
});

test("OpenLogi DeviceTypeAndName device type request uses zero padding", () => {
    assert.deepEqual(buildOpenLogiDeviceTypeRequestPayload(), [0x00, 0x00, 0x00]);
});

test("OpenLogi DeviceTypeAndName device type parser decodes known values", () => {
    assert.equal(parseOpenLogiDeviceType(0), "keyboard");
    assert.equal(parseOpenLogiDeviceType(3), "mouse");
    assert.equal(parseOpenLogiDeviceType(18), "carSimPedals");
    assert.equal(parseOpenLogiDeviceTypePayload([8]), "headset");
});

test("OpenLogi DeviceTypeAndName device type parser rejects unknown values", () => {
    assert.equal(parseOpenLogiDeviceType(0xFF), undefined);
});

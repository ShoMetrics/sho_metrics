import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenLogiDeviceInformationGetDeviceInfoRequestPayload,
    buildUnusedOpenLogiDeviceInformationSerialNumberRequestPayloadForParity,
    parseOpenLogiDeviceInformationCapabilities,
    parseOpenLogiDeviceInformationPayload,
    parseOpenLogiDeviceTransport,
    parseUnusedOpenLogiDeviceInformationSerialNumberPayloadForParity,
} from "./device-information";

test("OpenLogi DeviceInformation get_device_info request uses zero padding", () => {
    assert.deepEqual(buildOpenLogiDeviceInformationGetDeviceInfoRequestPayload(), [0x00, 0x00, 0x00]);
});

test("OpenLogi DeviceInformation serial number request uses zero padding", () => {
    assert.deepEqual(buildUnusedOpenLogiDeviceInformationSerialNumberRequestPayloadForParity(), [0x00, 0x00, 0x00]);
});

test("OpenLogi DeviceInformation parses device info payload offsets", () => {
    assert.deepEqual(parseOpenLogiDeviceInformationPayload([
        0x02,
        0x12, 0x34, 0x56, 0x78,
        0x00,
        0x0F,
        0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
        0x01,
        0x01,
    ]), {
        entityCount: 2,
        unitId: [0x12, 0x34, 0x56, 0x78],
        transport: {
            usb: true,
            eQuad: true,
            btle: true,
            bluetooth: true,
        },
        transportByte: 0x0F,
        modelId: [0x1A83, 0x1A85, 0x0000],
        extendedModelId: 0x01,
        capabilities: {
            serialNumber: true,
        },
    });
});

test("OpenLogi DeviceInformation defaults missing payload bytes to zero", () => {
    assert.deepEqual(parseOpenLogiDeviceInformationPayload([]), {
        entityCount: 0,
        unitId: [0, 0, 0, 0],
        transport: {
            usb: false,
            eQuad: false,
            btle: false,
            bluetooth: false,
        },
        transportByte: 0,
        modelId: [0, 0, 0],
        extendedModelId: 0,
        capabilities: {
            serialNumber: false,
        },
    });
});

test("OpenLogi DeviceInformation decodes transport bitfields", () => {
    assert.deepEqual(parseOpenLogiDeviceTransport(0x0F), {
        usb: true,
        eQuad: true,
        btle: true,
        bluetooth: true,
    });
    assert.deepEqual(parseOpenLogiDeviceTransport(0x00), {
        usb: false,
        eQuad: false,
        btle: false,
        bluetooth: false,
    });
});

test("OpenLogi DeviceInformation decodes capability bitfields", () => {
    assert.deepEqual(parseOpenLogiDeviceInformationCapabilities(0x01), {
        serialNumber: true,
    });
    assert.deepEqual(parseOpenLogiDeviceInformationCapabilities(0x00), {
        serialNumber: false,
    });
});

test("OpenLogi DeviceInformation serial number parser reads the first twelve UTF-8 bytes", () => {
    assert.equal(
        parseUnusedOpenLogiDeviceInformationSerialNumberPayloadForParity([
            0x53, 0x45, 0x52, 0x49,
            0x41, 0x4C, 0x2D, 0x31,
            0x32, 0x33, 0x34, 0x35,
            0xFF,
        ]),
        "SERIAL-12345",
    );
});

test("OpenLogi DeviceInformation serial number parser rejects invalid UTF-8", () => {
    assert.equal(
        parseUnusedOpenLogiDeviceInformationSerialNumberPayloadForParity([
            0x53, 0x45, 0x52, 0xFF,
            0x41, 0x4C, 0x2D, 0x31,
            0x32, 0x33, 0x34, 0x35,
        ]),
        undefined,
    );
});

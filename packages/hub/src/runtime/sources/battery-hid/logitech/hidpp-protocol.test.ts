import assert from "node:assert/strict";
import test from "node:test";
import {
    buildLogitechBatteryStatusRequest,
    buildLogitechBatteryVoltageRequest,
    buildLogitechDeviceInformationRequest,
    buildLogitechFeatureLookupRequest,
    buildLogitechUnifiedBatteryCapabilitiesRequest,
    buildLogitechUnifiedBatteryInfoRequest,
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    parseLogitechBatteryVoltageReport,
    parseLogitechBatteryStatusReport,
    parseLogitechDeviceInformationReport,
    parseLogitechFeatureLookupReport,
    parseLogitechUnifiedBatteryCapabilitiesReport,
    parseLogitechUnifiedBatteryInfoReport,
} from "./hidpp-protocol";

test("Logitech HID++ feature lookup request matches local probe framing", () => {
    const request = buildLogitechFeatureLookupRequest(0x02, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID);

    assert.deepEqual(request.bytes, [0x10, 0x02, 0x00, 0x01, 0x10, 0x04, 0x00]);
    assert.deepEqual(request.expectedResponse, {
        receiverSlot: 0x02,
        featureIndex: 0x00,
        functionByte: 0x01,
    });
});

test("Logitech HID++ feature lookup parses supported and unsupported features", () => {
    assert.deepEqual(
        parseLogitechFeatureLookupReport(
            [0x11, 0x02, 0x00, 0x01, 0x09, 0x00, 0x02],
            0x02,
            LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        ),
        {
            state: "supported",
            feature: {
                featureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
                featureIndex: 0x09,
                featureType: 0x00,
                featureVersion: 0x02,
            },
        },
    );

    assert.deepEqual(
        parseLogitechFeatureLookupReport(
            [0x11, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00],
            0x02,
            LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        ),
        {
            state: "unsupported",
            featureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        },
    );
});

test("Logitech BATTERY_STATUS parses matching slot, feature index, and function", () => {
    const request = buildLogitechBatteryStatusRequest(0x01, 0x08);

    const result = parseLogitechBatteryStatusReport(
        [0x11, 0x01, 0x08, 0x01, 0x14, 0x05, 0x00],
        request.expectedResponse,
    );

    assert.deepEqual(result, {
        state: "battery",
        reading: {
            featureId: 0x1000,
            percent: 20,
            percentSource: "reported",
            nextPercent: 5,
            statusByte: 0,
        },
    });
});

test("Logitech BATTERY_STATUS rejects unrelated, malformed, and out-of-range reports", () => {
    const request = buildLogitechBatteryStatusRequest(0x01, 0x08);

    assert.deepEqual(
        parseLogitechBatteryStatusReport([0x11, 0x02, 0x08, 0x01, 0x14, 0x05, 0x00], request.expectedResponse),
        { state: "unrelated" },
    );
    assert.deepEqual(
        parseLogitechBatteryStatusReport([0x11, 0x01, 0x08, 0x01, 0x14], request.expectedResponse),
        { state: "malformed" },
    );
    assert.deepEqual(
        parseLogitechBatteryStatusReport([0x11, 0x01, 0x08, 0x01, 0x65, 0x00, 0x00], request.expectedResponse),
        { state: "noData", reason: "outOfRange" },
    );
});

test("Logitech UNIFIED_BATTERY parses capability-gated percentage", () => {
    const capabilitiesRequest = buildLogitechUnifiedBatteryCapabilitiesRequest(0x02, 0x09);
    const infoRequest = buildLogitechUnifiedBatteryInfoRequest(0x02, 0x09);
    const capabilities = parseLogitechUnifiedBatteryCapabilitiesReport(
        [0x11, 0x02, 0x09, 0x01, 0x0F, 0x03, 0x00],
        capabilitiesRequest.expectedResponse,
    );

    assert.deepEqual(capabilities, {
        state: "capabilities",
        capabilities: {
            reportedLevelMask: 0x0F,
            isRechargeable: true,
            supportsPercentage: true,
        },
    });

    if (capabilities.state !== "capabilities") {
        throw new Error("Expected capabilities for unified battery test.");
    }

    assert.deepEqual(
        parseLogitechUnifiedBatteryInfoReport(
            [0x11, 0x02, 0x09, 0x11, 0x5A, 0x08, 0x00],
            infoRequest.expectedResponse,
            capabilities.capabilities,
        ),
        {
            state: "battery",
            reading: {
                featureId: 0x1004,
                percent: 90,
                percentSource: "reported",
                approximateLevelByte: 0x08,
                statusByte: 0,
            },
        },
    );
});

test("Logitech UNIFIED_BATTERY does not invent percentages from approximate levels", () => {
    const infoRequest = buildLogitechUnifiedBatteryInfoRequest(0x02, 0x09);

    assert.deepEqual(
        parseLogitechUnifiedBatteryInfoReport(
            [0x11, 0x02, 0x09, 0x11, 0x00, 0x08, 0x00],
            infoRequest.expectedResponse,
            {
                reportedLevelMask: 0x0F,
                isRechargeable: true,
                supportsPercentage: false,
            },
        ),
        { state: "noData", reason: "noPercentage" },
    );
});

test("Logitech BATTERY_VOLTAGE parses raw voltage as an estimated percentage", () => {
    const request = buildLogitechBatteryVoltageRequest(0x01, 0x07);

    assert.deepEqual(
        parseLogitechBatteryVoltageReport(
            [0x11, 0x01, 0x07, 0x01, 0x10, 0x46, 0x00],
            request.expectedResponse,
        ),
        {
            state: "battery",
            reading: {
                featureId: 0x1001,
                percent: 98,
                percentSource: "voltageEstimated",
                statusByte: 0,
                voltageMillivolts: 4166,
            },
        },
    );
});

test("Logitech DEVICE_INFORMATION parses unit id and exact model bucket", () => {
    const request = buildLogitechDeviceInformationRequest(0x02, 0x03);

    assert.deepEqual(
        parseLogitechDeviceInformationReport([
            0x11, 0x02, 0x03, 0x01,
            0x02,
            0x12, 0x34, 0x56, 0x78,
            0x00,
            0x0F,
            0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
            0x01,
            0x01,
        ], request.expectedResponse),
        {
            state: "deviceInformation",
            deviceInformation: {
                entityCount: 2,
                unitId: "12345678",
                transportFlags: 0x0F,
                modelId: "logitech:1a83-1a85-0000:ext-01",
                extendedModelId: 1,
                hasSerialNumberFunction: true,
            },
        },
    );
});

test("Logitech DEVICE_INFORMATION ignores all-zero unit and model ids", () => {
    const request = buildLogitechDeviceInformationRequest(0x02, 0x03);

    assert.deepEqual(
        parseLogitechDeviceInformationReport([
            0x11, 0x02, 0x03, 0x01,
            0x02,
            0x00, 0x00, 0x00, 0x00,
            0x00,
            0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00,
            0x00,
        ], request.expectedResponse),
        {
            state: "deviceInformation",
            deviceInformation: {
                entityCount: 2,
                unitId: undefined,
                transportFlags: 0,
                modelId: undefined,
                extendedModelId: 0,
                hasSerialNumberFunction: false,
            },
        },
    );
});

test("Logitech parser accepts reports without a report id prefix", () => {
    const request = buildLogitechBatteryStatusRequest(0x01, 0x08);

    assert.deepEqual(
        parseLogitechBatteryStatusReport([0x01, 0x08, 0x01, 0x14, 0x05, 0x00], request.expectedResponse),
        {
            state: "battery",
            reading: {
                featureId: 0x1000,
                percent: 20,
                percentSource: "reported",
                nextPercent: 5,
                statusByte: 0,
            },
        },
    );
});

test("Logitech feature lookup requires the requested receiver slot", () => {
    assert.deepEqual(
        parseLogitechFeatureLookupReport(
            [0x11, 0x03, 0x00, 0x01, 0x09, 0x00, 0x02],
            0x02,
            LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        ),
        { state: "unrelated" },
    );
});

test("Logitech DEVICE_INFORMATION lookup request uses the documented feature id", () => {
    const request = buildLogitechFeatureLookupRequest(0x02, LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID);

    assert.deepEqual(request.bytes, [0x10, 0x02, 0x00, 0x01, 0x00, 0x03, 0x00]);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { NativeHidDevice } from "../native-hid-loader-internal";
import {
    buildLogitechBatteryStatusRequest,
    LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
    LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    type LogitechHidppRequest,
} from "./hidpp-protocol";
import {
    LogitechHidppSession,
    NativeLogitechHidppTransport,
    type LogitechHidppExchangeResult,
    type LogitechHidppTransport,
} from "./logitech-hidpp-reader";

test("Logitech HID++ session reads UNIFIED_BATTERY with device identity", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x09,
        batteryStatusFeatureIndex: 0x00,
        deviceInformationFeatureIndex: 0x03,
        deviceTypeAndNameFeatureIndex: 0x05,
    }));
    const session = new LogitechHidppSession(transport);

    const result = session.readBattery(0x02);

    assert.equal(result.state, "battery");
    if (result.state !== "battery") {
        throw new Error("Expected battery reading.");
    }

    assert.equal(result.reading.featureId, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID);
    assert.equal(result.reading.percent, 90);
    assert.equal(result.reading.statusByte, 0);
    assert.equal(result.deviceInformation?.unitId, "12345678");
    assert.equal(result.deviceInformation?.modelId, "logitech:1a83-1a85-0000:ext-01");
    assert.deepEqual(result.deviceTypeAndName, {
        marketingName: "MX Master 3S",
        deviceType: "mouse",
    });
});

test("Logitech HID++ session falls back from UNIFIED_BATTERY to BATTERY_STATUS", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x00,
        batteryStatusFeatureIndex: 0x08,
        deviceInformationFeatureIndex: 0x00,
    }));
    const session = new LogitechHidppSession(transport);

    const result = session.readBattery(0x01);

    assert.deepEqual(result, {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
            percent: 20,
            percentSource: "reported",
            nextPercent: 5,
            statusByte: 0,
        },
        deviceInformation: undefined,
        unrelatedReportCount: 0,
    });
});

test("Logitech HID++ session falls back from BATTERY_STATUS to BATTERY_VOLTAGE", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x00,
        batteryStatusFeatureIndex: 0x00,
        batteryVoltageFeatureIndex: 0x07,
        deviceInformationFeatureIndex: 0x03,
    }));
    const session = new LogitechHidppSession(transport);

    const result = session.readBattery(0x01);

    assert.deepEqual(result, {
        state: "battery",
        reading: {
            featureId: LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
            percent: 98,
            percentSource: "voltageEstimated",
            statusByte: 0,
            voltageMillivolts: 4166,
        },
        deviceInformation: {
            entityCount: 2,
            unitId: "12345678",
            transportFlags: 15,
            modelId: "logitech:1a83-1a85-0000:ext-01",
            extendedModelId: 1,
            hasSerialNumberFunction: true,
        },
        unrelatedReportCount: 0,
    });
});

test("Logitech HID++ session does not probe BATTERY_VOLTAGE after BATTERY_STATUS no-data", () => {
    const transport = new ScriptedLogitechTransport(request => {
        const lookupFeatureId = readFeatureLookupRequestFeatureId(request.bytes);
        if (lookupFeatureId !== undefined) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [
                    featureIndexForId(lookupFeatureId, {
                        unifiedBatteryFeatureIndex: 0x00,
                        batteryStatusFeatureIndex: 0x08,
                        batteryVoltageFeatureIndex: 0x07,
                        deviceInformationFeatureIndex: 0x00,
                    }),
                    0x00,
                    0x02,
                ]),
                unrelatedReports: [],
            };
        }

        return {
            state: "timeout",
            unrelatedReports: [],
        };
    });
    const session = new LogitechHidppSession(transport);

    assert.deepEqual(session.readBattery(0x01), {
        state: "noData",
        reason: "timeout",
        unrelatedReportCount: 0,
    });

    const voltageFeatureLookups = transport.requests.filter(request =>
        readFeatureLookupRequestFeatureId(request) === LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
    );
    assert.equal(voltageFeatureLookups.length, 0);
});

test("Logitech HID++ session caches unsupported feature lookups", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x00,
        batteryStatusFeatureIndex: 0x00,
        deviceInformationFeatureIndex: 0x00,
    }));
    const session = new LogitechHidppSession(transport);

    assert.deepEqual(session.readBattery(0x01), { state: "unsupported" });
    assert.deepEqual(session.readBattery(0x01), { state: "unsupported" });

    const featureLookupRequests = transport.requests.filter(request =>
        request[2] === 0x00 &&
        request[3] === 0x01,
    );
    assert.equal(featureLookupRequests.length, 3);
});

test("Logitech HID++ session reads device information once per receiver slot", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x09,
        batteryStatusFeatureIndex: 0x00,
        deviceInformationFeatureIndex: 0x03,
    }));
    const session = new LogitechHidppSession(transport);

    session.readBattery(0x02);
    session.readBattery(0x02);

    const deviceInformationReads = transport.requests.filter(request =>
        request[2] === 0x03 &&
        request[3] === 0x01,
    );
    assert.equal(deviceInformationReads.length, 1);
});

test("Logitech HID++ session reads device type and name once per receiver slot", () => {
    const transport = new ScriptedLogitechTransport(request => responseForRequest(request, {
        unifiedBatteryFeatureIndex: 0x09,
        batteryStatusFeatureIndex: 0x00,
        deviceInformationFeatureIndex: 0x00,
        deviceTypeAndNameFeatureIndex: 0x05,
    }));
    const session = new LogitechHidppSession(transport);

    session.readBattery(0x02);
    session.readBattery(0x02);

    const nameCountReads = transport.requests.filter(request =>
        request[2] === 0x05 &&
        request[3] === 0x01,
    );
    const deviceTypeReads = transport.requests.filter(request =>
        request[2] === 0x05 &&
        request[3] === 0x21,
    );
    assert.equal(nameCountReads.length, 1);
    assert.equal(deviceTypeReads.length, 1);
});

test("Logitech HID++ session caps malformed device name counts", () => {
    const transport = new ScriptedLogitechTransport(request => {
        const lookupFeatureId = readFeatureLookupRequestFeatureId(request.bytes);
        if (lookupFeatureId !== undefined) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [
                    featureIndexForId(lookupFeatureId, {
                        unifiedBatteryFeatureIndex: 0x09,
                        batteryStatusFeatureIndex: 0x00,
                        deviceInformationFeatureIndex: 0x00,
                        deviceTypeAndNameFeatureIndex: 0x05,
                    }),
                    0x00,
                    featureVersionForId(lookupFeatureId),
                ]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[2] === 0x09 && request.bytes[3] === 0x01) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0x0F, 0x03, 0x00]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[2] === 0x09 && request.bytes[3] === 0x11) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0x5A, 0x08, 0x00]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[2] === 0x05 && request.bytes[3] === 0x01) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0xFF, 0x00, 0x00]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[2] === 0x05 && request.bytes[3] === 0x21) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0x03, 0x00, 0x00]),
                unrelatedReports: [],
            };
        }

        return {
            state: "timeout",
            unrelatedReports: [],
        };
    });
    const session = new LogitechHidppSession(transport);

    const result = session.readBattery(0x02);

    assert.equal(result.state, "battery");
    if (result.state !== "battery") {
        throw new Error("Expected battery reading.");
    }
    assert.deepEqual(result.deviceTypeAndName, {
        deviceType: "mouse",
        marketingName: undefined,
    });
    const nameChunkReads = transport.requests.filter(request =>
        request[2] === 0x05 &&
        request[3] === 0x11,
    );
    assert.equal(nameChunkReads.length, 0);
});

test("Logitech HID++ session returns no-data on timeout", () => {
    const transport = new ScriptedLogitechTransport(() => ({
        state: "timeout",
        unrelatedReports: [],
    }));
    const session = new LogitechHidppSession(transport);

    assert.deepEqual(session.readBattery(0x01), {
        state: "noData",
        reason: "timeout",
        unrelatedReportCount: 0,
    });
});

test("native Logitech HID++ transport ignores unrelated interleaved reports", () => {
    const request = buildLogitechBatteryStatusRequest(0x01, 0x08);
    const device = new FakeNativeHidDevice(writeBytes => [
        [0x11, 0x01, 0x0A, 0x00, 0x03, 0x02],
        buildResponse(writeBytes, [0x14, 0x05, 0x00]),
    ]);
    const transport = new NativeLogitechHidppTransport(device, [device]);

    const result = transport.exchange(request);

    assert.equal(result.state, "response");
    if (result.state !== "response") {
        throw new Error("Expected response.");
    }

    assert.deepEqual(result.unrelatedReports, [[0x11, 0x01, 0x0A, 0x00, 0x03, 0x02]]);
    assert.deepEqual(result.report, [0x11, 0x01, 0x08, 0x01, 0x14, 0x05, 0x00]);
});

test("native Logitech HID++ transport reports HID++ device errors without throwing", () => {
    const request = buildLogitechBatteryStatusRequest(0x01, 0x08);
    const device = new FakeNativeHidDevice(() => [
        [0x11, 0x01, 0xFF, 0x08, 0x01, 0x07],
    ]);
    const transport = new NativeLogitechHidppTransport(device, [device]);

    assert.deepEqual(transport.exchange(request), {
        state: "deviceError",
        errorCode: 0x07,
        unrelatedReports: [],
    });
});

class ScriptedLogitechTransport implements LogitechHidppTransport {
    readonly requests: readonly number[][] = [];

    constructor(private readonly resolveResponse: (request: LogitechHidppRequest) => LogitechHidppExchangeResult) {}

    exchange(request: LogitechHidppRequest): LogitechHidppExchangeResult {
        (this.requests as number[][]).push([...request.bytes]);
        return this.resolveResponse(request);
    }
}

interface ScriptedLogitechFeatureIndexes {
    readonly unifiedBatteryFeatureIndex: number;
    readonly batteryStatusFeatureIndex: number;
    readonly batteryVoltageFeatureIndex?: number;
    readonly deviceInformationFeatureIndex: number;
    readonly deviceTypeAndNameFeatureIndex?: number;
}

function responseForRequest(
    request: LogitechHidppRequest,
    featureIndexes: ScriptedLogitechFeatureIndexes,
): LogitechHidppExchangeResult {
    const lookupFeatureId = readFeatureLookupRequestFeatureId(request.bytes);
    if (lookupFeatureId !== undefined) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [
                featureIndexForId(lookupFeatureId, featureIndexes),
                0x00,
                featureVersionForId(lookupFeatureId),
            ]),
            unrelatedReports: [],
        };
    }

    if (request.bytes[2] === featureIndexes.deviceInformationFeatureIndex && request.bytes[3] === 0x01) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [
                0x02,
                0x12, 0x34, 0x56, 0x78,
                0x00,
                0x0F,
                0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
                0x01,
                0x01,
            ]),
            unrelatedReports: [],
        };
    }

    if (featureIndexes.deviceTypeAndNameFeatureIndex !== undefined &&
        featureIndexes.deviceTypeAndNameFeatureIndex !== 0 &&
        request.bytes[2] === featureIndexes.deviceTypeAndNameFeatureIndex) {
        if (request.bytes[3] === 0x01) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0x0C, 0x00, 0x00]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[3] === 0x11) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [
                    0x4D, 0x58, 0x20, 0x4D,
                    0x61, 0x73, 0x74, 0x65,
                    0x72, 0x20, 0x33, 0x53,
                ]),
                unrelatedReports: [],
            };
        }

        if (request.bytes[3] === 0x21) {
            return {
                state: "response",
                report: buildResponse(request.bytes, [0x03, 0x00, 0x00]),
                unrelatedReports: [],
            };
        }
    }

    if (request.bytes[2] === featureIndexes.unifiedBatteryFeatureIndex && request.bytes[3] === 0x01) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [0x0F, 0x03, 0x00]),
            unrelatedReports: [],
        };
    }

    if (request.bytes[2] === featureIndexes.unifiedBatteryFeatureIndex && request.bytes[3] === 0x11) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [0x5A, 0x08, 0x00]),
            unrelatedReports: [],
        };
    }

    if (request.bytes[2] === featureIndexes.batteryStatusFeatureIndex && request.bytes[3] === 0x01) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [0x14, 0x05, 0x00]),
            unrelatedReports: [],
        };
    }

    if (request.bytes[2] === featureIndexes.batteryVoltageFeatureIndex && request.bytes[3] === 0x01) {
        return {
            state: "response",
            report: buildResponse(request.bytes, [0x10, 0x46, 0x00]),
            unrelatedReports: [],
        };
    }

    return {
        state: "timeout",
        unrelatedReports: [],
    };
}

function readFeatureLookupRequestFeatureId(requestBytes: readonly number[]): number | undefined {
    return requestBytes[2] === 0x00 && requestBytes[3] === 0x01
        ? (requestBytes[4] << 8) | requestBytes[5]
        : undefined;
}

function featureIndexForId(
    featureId: number,
    featureIndexes: ScriptedLogitechFeatureIndexes,
): number {
    switch (featureId) {
        case LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID:
            return featureIndexes.deviceInformationFeatureIndex;
        case LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID:
            return featureIndexes.deviceTypeAndNameFeatureIndex ?? 0;
        case LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID:
            return featureIndexes.unifiedBatteryFeatureIndex;
        case LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID:
            return featureIndexes.batteryStatusFeatureIndex;
        case LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID:
            return featureIndexes.batteryVoltageFeatureIndex ?? 0;
        default:
            return 0;
    }
}

function featureVersionForId(featureId: number): number {
    if (featureId === LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID) {
        return 0x04;
    }

    return featureId === LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID ? 0x00 : 0x02;
}

function buildResponse(requestBytes: readonly number[], payload: readonly number[]): readonly number[] {
    return [
        0x11,
        requestBytes[1],
        requestBytes[2],
        requestBytes[3],
        ...payload,
    ];
}

class FakeNativeHidDevice implements NativeHidDevice {
    private queuedReports: number[][] = [];

    constructor(private readonly buildReports: (writeBytes: readonly number[]) => readonly (readonly number[])[]) {}

    close(): void {}

    getFeatureReport(): number[] {
        return [];
    }

    readTimeout(): number[] {
        return this.queuedReports.shift() ?? [];
    }

    sendFeatureReport(): number {
        return 0;
    }

    write(data: number[] | Buffer): number {
        const bytes = Array.from(data);
        this.queuedReports = this.buildReports(bytes).map(report => [...report]);
        return bytes.length;
    }
}

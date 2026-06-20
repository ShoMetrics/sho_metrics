import assert from "node:assert/strict";
import test from "node:test";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    type LogitechHidppRequest,
} from "./hidpp-protocol";
import { LogitechBatteryDeviceDiscoverer } from "./logitech-battery-discovery";
import type { LogitechHidppExchangeResult } from "./logitech-hidpp-reader";

test("Logitech discovery emits supported non-MX HID++ battery candidates", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildBoltReceiverDeviceInfo()],
        request => responseForDiscoveryRequest(request, {
            supportedSlot: 2,
            batteryFeatureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        }),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName.includes("MX"), false);
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "bolt");
    assert.equal(candidates[0].identity.vendorUnitId, "12345678");
    assert.equal(candidates[0].identity.modelId, "logitech:1a83-1a85-0000:ext-01");
    assert.equal(candidates[0].diagnostics?.receiverSlot, 2);
});

test("Logitech discovery hides unsupported receiver slots from normal UI candidates", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildBoltReceiverDeviceInfo()],
        request => responseForDiscoveryRequest(request, {
            supportedSlot: undefined,
            batteryFeatureId: LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
        }),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(), []);
});

test("Logitech discovery accepts Unifying Nano receiver management paths", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildUnifyingNanoReceiverDeviceInfo()],
        request => responseForDiscoveryRequest(request, {
            supportedSlot: 1,
            batteryFeatureId: LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID,
        }),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "unifying");
    assert.equal(candidates[0].diagnostics?.receiverSlot, 1);
});

test("Logitech discovery probes direct HID++ devices through self slot", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildDirectHidppLongDeviceInfo()],
        request => responseForDiscoveryRequest(request, {
            supportedSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
            batteryFeatureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        }),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].candidateId.startsWith("logitech-direct-"), true);
    assert.equal(candidates[0].displayName, "G-series HID++ device");
    assert.equal(candidates[0].transport, "usbWired");
    assert.equal(candidates[0].receiverKind, undefined);
    assert.equal(candidates[0].identity.vendorUnitId, "12345678");
    assert.equal(candidates[0].identity.receiverSlot, undefined);
    assert.equal(candidates[0].supportState, "experimental");
});

test("Logitech discovery groups direct short and long Windows collections", async () => {
    const openedPaths: string[] = [];
    const nativeModule = new FakeNativeHidModule(
        [
            buildDirectHidppLongDeviceInfo(),
            buildDirectHidppShortSiblingDeviceInfo(),
        ],
        request => responseForDiscoveryRequest(request, {
            supportedSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
            batteryFeatureId: LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        }),
        openedPaths,
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.deepEqual(openedPaths, [
        "hid#vid_046d&pid_b025&mi_02&col01#same-device",
        "hid#vid_046d&pid_b025&mi_02&col02#same-device",
    ]);
});

function buildBoltReceiverDeviceInfo(): NativeHidDeviceInfo {
    return {
        path: "bolt-path",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        manufacturer: "Logitech",
        product: "USB Receiver",
        serialNumber: "receiver-serial",
        release: 0,
        interface: 2,
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usage: 1,
    };
}

function buildUnifyingNanoReceiverDeviceInfo(): NativeHidDeviceInfo {
    return {
        ...buildBoltReceiverDeviceInfo(),
        path: "unifying-nano-path",
        productId: LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
        product: "USB Receiver",
    };
}

function buildDirectHidppLongDeviceInfo(): NativeHidDeviceInfo {
    return {
        path: "hid#vid_046d&pid_b025&mi_02&col02#same-device",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xB025,
        manufacturer: "Logitech",
        product: "G-series HID++ device",
        serialNumber: "raw-hid-serial-is-not-trusted",
        release: 0,
        interface: 2,
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usage: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    };
}

function buildDirectHidppShortSiblingDeviceInfo(): NativeHidDeviceInfo {
    return {
        ...buildDirectHidppLongDeviceInfo(),
        path: "hid#vid_046d&pid_b025&mi_02&col01#same-device",
        usage: LOGITECH_HIDPP_SHORT_USAGE,
    };
}

class FakeNativeHidModule implements NativeHidModule {
    readonly HID: new(path: string) => NativeHidDevice;

    constructor(
        private readonly deviceInfoList: readonly NativeHidDeviceInfo[],
        resolveResponse: (request: LogitechHidppRequest) => LogitechHidppExchangeResult,
        openedPaths: string[] = [],
    ) {
        this.HID = class extends FakeNativeHidDevice {
            constructor(path: string) {
                openedPaths.push(path);
                super(resolveResponse);
            }
        };
    }

    devices(): NativeHidDeviceInfo[] {
        return [...this.deviceInfoList];
    }
}

class FakeNativeHidDevice implements NativeHidDevice {
    private queuedReports: number[][] = [];

    constructor(private readonly resolveResponse: (request: LogitechHidppRequest) => LogitechHidppExchangeResult) {}

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
        const request = buildRequestFromWrittenBytes(bytes);
        const response = this.resolveResponse(request);
        this.queuedReports = response.state === "response" ? [[...response.report]] : [];
        return bytes.length;
    }
}

function responseForDiscoveryRequest(
    request: LogitechHidppRequest,
    input: {
        readonly supportedSlot: number | undefined;
        readonly batteryFeatureId: number;
    },
): LogitechHidppExchangeResult {
    if (input.supportedSlot !== request.expectedResponse.receiverSlot) {
        return buildResponse(request, [0x00, 0x00, 0x00]);
    }

    const lookupFeatureId = readFeatureLookupRequestFeatureId(request.bytes);
    if (lookupFeatureId !== undefined) {
        switch (lookupFeatureId) {
            case LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID:
                return buildResponse(request, [0x03, 0x00, 0x04]);
            case LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID:
                return buildResponse(request, [
                    input.batteryFeatureId === LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID ? 0x09 : 0x00,
                    0x00,
                    0x02,
                ]);
            case LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID:
                return buildResponse(request, [
                    input.batteryFeatureId === LOGITECH_HIDPP_BATTERY_STATUS_FEATURE_ID ? 0x08 : 0x00,
                    0x00,
                    0x02,
                ]);
            default:
                return buildResponse(request, [0x00, 0x00, 0x00]);
        }
    }

    if (request.expectedResponse.featureIndex === 0x03) {
        return buildResponse(request, [
            0x02,
            0x12, 0x34, 0x56, 0x78,
            0x00,
            0x0F,
            0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
            0x01,
            0x01,
        ]);
    }

    if (request.expectedResponse.featureIndex === 0x09 && request.expectedResponse.functionByte === 0x00) {
        return buildResponse(request, [0x0F, 0x03, 0x00]);
    }

    if (request.expectedResponse.featureIndex === 0x09 && request.expectedResponse.functionByte === 0x10) {
        return buildResponse(request, [0x40, 0x04, 0x00]);
    }

    if (request.expectedResponse.featureIndex === 0x08 && request.expectedResponse.functionByte === 0x00) {
        return buildResponse(request, [0x40, 0x05, 0x00]);
    }

    return {
        state: "timeout",
        unrelatedReports: [],
    };
}

function buildResponse(
    request: LogitechHidppRequest,
    payload: readonly number[],
): LogitechHidppExchangeResult {
    return {
        state: "response",
        report: [
            0x11,
            request.expectedResponse.receiverSlot,
            request.expectedResponse.featureIndex,
            request.expectedResponse.functionByte,
            ...payload,
        ],
        unrelatedReports: [],
    };
}

function readFeatureLookupRequestFeatureId(requestBytes: readonly number[]): number | undefined {
    return requestBytes[2] === 0x00 && requestBytes[3] === 0x01
        ? (requestBytes[4] << 8) | requestBytes[5]
        : undefined;
}

function buildRequestFromWrittenBytes(bytes: readonly number[]): LogitechHidppRequest {
    return {
        bytes: [...bytes],
        expectedResponse: {
            receiverSlot: bytes[1],
            featureIndex: bytes[2],
            functionByte: bytes[3],
        },
    };
}

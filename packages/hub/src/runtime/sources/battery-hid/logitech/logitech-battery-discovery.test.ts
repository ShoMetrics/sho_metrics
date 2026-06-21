import assert from "node:assert/strict";
import test from "node:test";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
} from "./hidpp-protocol";
import { LogitechBatteryDeviceDiscoverer } from "./battery-discovery/logitech-battery-discovery";
import { SOLAAR_LOGITECH_KNOWN_LIGHTSPEED_RECEIVER_ROUTES } from "./solaar-derived/solaar-logitech-receiver-routes";

const LOGITECH_DIRECT_CLASSIC_LONG_USAGE = 0x0002;

test("Logitech discovery emits Bolt receiver candidates from online pairing registers", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildBoltReceiverDeviceInfo()],
        writeBytes => responseReportsForBoltDiscovery(writeBytes, 2),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "MX Master 3S");
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "bolt");
    assert.equal(candidates[0].identity.vendorUnitId, "12345678");
    assert.equal(candidates[0].identity.modelId, "logitech:1a83-1a85-0000:ext-01");
    assert.equal(candidates[0].identity.receiverSlot, 2);
    assert.equal(candidates[0].diagnostics?.receiverSlot, 2);
});

test("Logitech discovery hides offline Bolt receiver slots", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildBoltReceiverDeviceInfo()],
        writeBytes => responseReportsForBoltDiscovery(writeBytes, undefined),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(), []);
});

test("Logitech discovery uses Unifying arrival events as the online slot source", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildUnifyingNanoReceiverDeviceInfo()],
        writeBytes => responseReportsForUnifyingDiscovery(writeBytes, 1),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "Logitech Unifying mouse (slot 1)");
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "unifying");
    assert.equal(candidates[0].identity.vendorUnitId, "12345678");
    assert.equal(candidates[0].diagnostics?.receiverSlot, 1);
});

test("Logitech discovery emits LIGHTSPEED candidates from responsive slot 1", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildLightspeedReceiverDeviceInfo()],
        writeBytes => responseReportsForLightspeedDiscovery(writeBytes),
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "G502 X PLUS");
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "lightspeed");
    assert.equal(candidates[0].identity.vendorUnitId, "12345678");
    assert.equal(candidates[0].diagnostics?.receiverSlot, 1);
    assert.equal(candidates[0].diagnostics?.batteryPercentSource, "voltageEstimated");
    assert.equal(candidates[0].diagnostics?.batteryVoltageMillivolts, 4166);
});

test("Logitech discovery leaves direct HID++ paths to OS or future wired support", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildDirectHidppLongDeviceInfo()],
        () => [],
    );
    const discoverer = new LogitechBatteryDeviceDiscoverer(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(), []);
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
        usage: LOGITECH_HIDPP_SHORT_USAGE,
    };
}

function buildUnifyingNanoReceiverDeviceInfo(): NativeHidDeviceInfo {
    return {
        ...buildBoltReceiverDeviceInfo(),
        path: "unifying-nano-path",
        productId: LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    };
}

function buildLightspeedReceiverDeviceInfo(): NativeHidDeviceInfo {
    return {
        ...buildBoltReceiverDeviceInfo(),
        path: "lightspeed-path",
        productId: SOLAAR_LOGITECH_KNOWN_LIGHTSPEED_RECEIVER_ROUTES[0].productId,
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
        usage: LOGITECH_DIRECT_CLASSIC_LONG_USAGE,
    };
}

function responseReportsForBoltDiscovery(
    writeBytes: readonly number[],
    onlineSlot: number | undefined,
): readonly (readonly number[])[] {
    const pairingSlot = readPairingInformationSlot(writeBytes);
    if (pairingSlot !== undefined) {
        return [buildPairingInformationResponse(writeBytes, pairingSlot === onlineSlot)];
    }

    return responseReportsForBatteryRead(writeBytes, onlineSlot, {
        deviceTypeAndNameFeatureIndex: 0x05,
        marketingName: "MX Master 3S",
    });
}

function responseReportsForUnifyingDiscovery(
    writeBytes: readonly number[],
    onlineSlot: number,
): readonly (readonly number[])[] {
    if (isReceiverArrivalTrigger(writeBytes)) {
        return [
            [0x10, onlineSlot, 0x41, 0x00, 0x02, 0x34, 0x12],
            [0x10, 0xFF, 0x80, 0x02, 0x00, 0x00, 0x00],
        ];
    }

    return responseReportsForBatteryRead(writeBytes, onlineSlot, {
        deviceTypeAndNameFeatureIndex: 0x00,
        marketingName: undefined,
    });
}

function responseReportsForLightspeedDiscovery(
    writeBytes: readonly number[],
): readonly (readonly number[])[] {
    if (writeBytes[1] !== 1) {
        return [buildFeatureResponse(writeBytes, [0x00, 0x00, 0x00])];
    }

    const featureId = readFeatureLookupRequestFeatureId(writeBytes);
    if (featureId !== undefined) {
        return [buildFeatureResponse(writeBytes, lightspeedFeatureLookupPayload(featureId))];
    }

    const deviceTypeAndNameResponse = responseReportsForDeviceTypeAndName(writeBytes, "G502 X PLUS");
    if (deviceTypeAndNameResponse.length !== 0) {
        return deviceTypeAndNameResponse;
    }

    if (writeBytes[2] === 0x07 && writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [0x10, 0x46, 0x00])];
    }

    if (writeBytes[2] === 0x03 && writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [
            0x02,
            0x12, 0x34, 0x56, 0x78,
            0x00,
            0x0F,
            0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
            0x01,
            0x01,
        ])];
    }

    return [];
}

function responseReportsForBatteryRead(
    writeBytes: readonly number[],
    supportedSlot: number | undefined,
    options: {
        readonly deviceTypeAndNameFeatureIndex: number;
        readonly marketingName: string | undefined;
    },
): readonly (readonly number[])[] {
    const receiverSlot = writeBytes[1];
    if (receiverSlot !== supportedSlot) {
        return [buildFeatureResponse(writeBytes, [0x00, 0x00, 0x00])];
    }

    const featureId = readFeatureLookupRequestFeatureId(writeBytes);
    if (featureId !== undefined) {
        return [buildFeatureResponse(writeBytes, featureLookupPayload(featureId, options.deviceTypeAndNameFeatureIndex))];
    }

    const deviceTypeAndNameResponse = responseReportsForDeviceTypeAndName(writeBytes, options.marketingName);
    if (deviceTypeAndNameResponse.length !== 0) {
        return deviceTypeAndNameResponse;
    }

    if (writeBytes[2] === 0x09 && writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [0x0F, 0x03, 0x00])];
    }

    if (writeBytes[2] === 0x09 && writeBytes[3] === 0x11) {
        return [buildFeatureResponse(writeBytes, [0x40, 0x04, 0x00])];
    }

    if (writeBytes[2] === 0x03 && writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [
            0x02,
            0x12, 0x34, 0x56, 0x78,
            0x00,
            0x0F,
            0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
            0x01,
            0x01,
        ])];
    }

    if (writeBytes[2] === 0x07 && writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [0x10, 0x46, 0x00])];
    }

    return [];
}

function featureLookupPayload(featureId: number, deviceTypeAndNameFeatureIndex: number): readonly number[] {
    switch (featureId) {
        case LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID:
            return [0x09, 0x00, 0x02];
        case LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID:
            return [0x07, 0x00, 0x02];
        case 0x0003:
            return [0x03, 0x00, 0x04];
        case LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID:
            return [deviceTypeAndNameFeatureIndex, 0x00, 0x00];
        default:
            return [0x00, 0x00, 0x00];
    }
}

function lightspeedFeatureLookupPayload(featureId: number): readonly number[] {
    switch (featureId) {
        case LOGITECH_HIDPP_BATTERY_VOLTAGE_FEATURE_ID:
            return [0x07, 0x00, 0x02];
        case 0x0003:
            return [0x03, 0x00, 0x04];
        case LOGITECH_HIDPP_DEVICE_TYPE_AND_NAME_FEATURE_ID:
            return [0x05, 0x00, 0x00];
        default:
            return [0x00, 0x00, 0x00];
    }
}

function responseReportsForDeviceTypeAndName(
    writeBytes: readonly number[],
    marketingName: string | undefined,
): readonly (readonly number[])[] {
    if (marketingName === undefined || writeBytes[2] !== 0x05) {
        return [];
    }

    const marketingNameBytes = [...new TextEncoder().encode(marketingName)];
    if (writeBytes[3] === 0x01) {
        return [buildFeatureResponse(writeBytes, [marketingNameBytes.length, 0x00, 0x00])];
    }

    if (writeBytes[3] === 0x11) {
        const startIndex = writeBytes[4] ?? 0;
        return [buildFeatureResponse(writeBytes, marketingNameBytes.slice(startIndex))];
    }

    if (writeBytes[3] === 0x21) {
        return [buildFeatureResponse(writeBytes, [0x03, 0x00, 0x00])];
    }

    return [];
}

function buildPairingInformationResponse(
    requestBytes: readonly number[],
    online: boolean,
): readonly number[] {
    const flags = online ? 0x22 : 0x62;
    return buildLongRegisterResponse(requestBytes, [
        requestBytes[4] ?? 0x50,
        flags,
        0x34, 0x12,
        0x12, 0x34, 0x56, 0x78,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
    ]);
}

function buildLongRegisterResponse(
    requestBytes: readonly number[],
    payload: readonly number[],
): readonly number[] {
    return [
        0x11,
        requestBytes[1] ?? 0xFF,
        requestBytes[2] ?? 0x83,
        requestBytes[3] ?? 0xB5,
        ...payload,
    ];
}

function buildFeatureResponse(
    requestBytes: readonly number[],
    payload: readonly number[],
): readonly number[] {
    return [
        0x11,
        requestBytes[1] ?? 0x00,
        requestBytes[2] ?? 0x00,
        requestBytes[3] ?? 0x00,
        ...payload,
    ];
}

function readPairingInformationSlot(writeBytes: readonly number[]): number | undefined {
    return writeBytes[1] === 0xFF &&
        writeBytes[2] === 0x83 &&
        writeBytes[3] === 0xB5 &&
        (writeBytes[4] & 0xF0) === 0x50
        ? writeBytes[4] & 0x0F
        : undefined;
}

function isReceiverArrivalTrigger(writeBytes: readonly number[]): boolean {
    return writeBytes[1] === 0xFF &&
        writeBytes[2] === 0x80 &&
        writeBytes[3] === 0x02 &&
        writeBytes[4] === 0x02;
}

function readFeatureLookupRequestFeatureId(writeBytes: readonly number[]): number | undefined {
    return writeBytes[2] === 0x00 && writeBytes[3] === 0x01
        ? (writeBytes[4] << 8) | writeBytes[5]
        : undefined;
}

class FakeNativeHidModule implements NativeHidModule {
    readonly HID: new(path: string) => NativeHidDevice;

    constructor(
        private readonly deviceInfoList: readonly NativeHidDeviceInfo[],
        buildReports: (writeBytes: readonly number[]) => readonly (readonly number[])[],
    ) {
        this.HID = class extends FakeNativeHidDevice {
            constructor() {
                super(buildReports);
            }
        };
    }

    devices(): NativeHidDeviceInfo[] {
        return [...this.deviceInfoList];
    }
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
        this.queuedReports.push(...this.buildReports(bytes).map(report => [...report]));
        return bytes.length;
    }
}

import assert from "node:assert/strict";
import test from "node:test";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import {
    ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
    ASUS_ROG_VENDOR_ID,
} from "./asus-rog-protocol";
import { AsusRogBatteryReader } from "./asus-rog-battery-discovery";
import { ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES } from "./asus-rog-keyboard-routes";
import { ASUS_ROG_KNOWN_MOUSE_DIRECT_PID_ROUTES } from "./asus-rog-mouse-routes";

test("ASUS ROG discovery emits verified keyboard candidates", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildKeyboardDeviceInfo()],
        () => [0x12, 0x01, 0x00, 0x00, 0x00, 0x5c, 0x02, 0x01, 0x01],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "ROG Strix Scope II 96 RX");
    assert.equal(candidates[0].transport, "usbWired");
    assert.equal(candidates[0].supportState, "supported");
    assert.equal(candidates[0].isExperimental, true);
});

test("ASUS ROG discovery marks theory-backed mouse candidates experimental", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildMouseDeviceInfo()],
        () => [
            0x00, 0x12, 0x07, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
        ],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "ROG Keris Wireless");
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].supportState, "experimental");
    assert.equal(candidates[0].isExperimental, true);
    assert.equal(
        candidates[0].identity.modelId,
        "asus-rog-mouse:keris-wireless",
    );
});

test("ASUS ROG discovery marks OpenRGB-derived keyboard routes experimental", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildKeyboardDeviceInfo(0x190c, "ROG Strix Scope TKL")],
        () => [0x12, 0x01, 0x00, 0x00, 0x00, 0x51, 0x02, 0x01, 0x00],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "ROG Strix Scope TKL");
    assert.equal(candidates[0].supportState, "experimental");
    assert.equal(candidates[0].identity.interfaceNumber, 1);
});

test("ASUS ROG discovery covers known direct mouse battery routes from G-Helper", async () => {
    const nativeModule = new FakeNativeHidModule(
        KNOWN_DIRECT_MOUSE_ROUTE_CASES.map((routeCase) =>
            buildMouseDeviceInfo(
                routeCase.productId,
                routeCase.endpointPathToken,
            ),
        ),
        (writtenBytes) => [
            writtenBytes[0] ?? 0x00,
            0x12,
            0x07,
            0x00,
            0x00,
            0x02,
            0x00,
            0x02,
            0x00,
            0x00,
            0x00,
        ],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, KNOWN_DIRECT_MOUSE_ROUTE_CASES.length);
    assert.deepEqual(
        candidates
            .map(readRequiredProductId)
            .sort((left, right) => left - right),
        KNOWN_DIRECT_MOUSE_ROUTE_CASES.map(
            (routeCase) => routeCase.productId,
        ).sort((left, right) => left - right),
    );
    assert.deepEqual(
        candidates.map((candidate) => candidate.identity.modelId).sort(),
        KNOWN_DIRECT_MOUSE_ROUTE_CASES.map(
            (routeCase) => routeCase.modelId,
        ).sort(),
    );
});

test("ASUS ROG discovery covers known interface-1 keyboard routes from local probes and OpenRGB", async () => {
    const nativeModule = new FakeNativeHidModule(
        ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES.map((route) =>
            buildKeyboardDeviceInfo(
                route.productId,
                route.displayName,
                route.interfaceNumber,
            ),
        ),
        () => [0x12, 0x01, 0x00, 0x00, 0x00, 0x51, 0x02, 0x01, 0x00],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(
        candidates.length,
        ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES.length,
    );
    assert.deepEqual(
        candidates
            .map(readRequiredProductId)
            .sort((left, right) => left - right),
        ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES.map(
            (route) => route.productId,
        ).sort((left, right) => left - right),
    );
});

test("ASUS ROG discovery does not open unmatched ASUS PIDs", async () => {
    const nativeModule = new FakeNativeHidModule(
        [
            {
                path: "hid#vid_0b05&pid_dead&mi_01",
                vendorId: ASUS_ROG_VENDOR_ID,
                productId: 0xdead,
                release: 0,
                interface: 1,
                usagePage: ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
                usage: 1,
            },
        ],
        () => [0x12, 0x01],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(nativeModule.devices()), []);
    assert.equal(nativeModule.openCount, 0);
});

test("ASUS ROG discovery treats allowlisted open failures as no-data", async () => {
    const nativeModule = new ThrowingNativeHidModule([
        buildKeyboardDeviceInfo(),
    ]);
    const discoverer = new AsusRogBatteryReader(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(nativeModule.devices()), []);
    assert.equal(nativeModule.openCount, 1);
});

test("ASUS ROG discovery does not open known ASUS mouse models without battery support", async () => {
    const nativeModule = new FakeNativeHidModule(
        [
            buildMouseDeviceInfo(0x195c, "mi_00"),
            buildMouseDeviceInfo(0x1958, "mi_00"),
            buildMouseDeviceInfo(0x1846, "mi_02"),
            buildMouseDeviceInfo(0x1847, "mi_02"),
            buildMouseDeviceInfo(0x18e1, "mi_00"),
            buildMouseDeviceInfo(0x1a88, "mi_00"),
            buildMouseDeviceInfo(0x1910, "mi_01"),
            buildMouseDeviceInfo(0x1a03, "mi_00"),
            buildMouseDeviceInfo(0x1898, "mi_02"),
        ],
        () => [0x00, 0x12, 0x07],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(nativeModule.devices()), []);
    assert.equal(nativeModule.openCount, 0);
});

test("ASUS ROG discovery does not open Omni mouse routes before paired-device lookup exists", async () => {
    const nativeModule = new FakeNativeHidModule(
        [buildMouseDeviceInfo(0x1ace, "mi_02&col03")],
        () => [0x03, 0x12, 0x07],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(nativeModule.devices()), []);
    assert.equal(nativeModule.openCount, 0);
});

test("ASUS ROG discovery ignores standard input collections", async () => {
    const nativeModule = new FakeNativeHidModule(
        [
            {
                path: "hid#vid_0b05&pid_1b78&kbd",
                vendorId: ASUS_ROG_VENDOR_ID,
                productId: 0x1b78,
                release: 0,
                interface: 1,
                usagePage: 0x0001,
                usage: 0x0006,
            },
        ],
        () => [0x12, 0x01],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    assert.deepEqual(await discoverer.discoverBatteryDevices(nativeModule.devices()), []);
    assert.equal(nativeModule.openCount, 0);
});

test("ASUS ROG discovery keeps Azoth device-PID wireless receiver kind generic", async () => {
    const nativeModule = new FakeNativeHidModule(
        [
            {
                path: "hid#vid_0b05&pid_1a85&mi_01",
                vendorId: ASUS_ROG_VENDOR_ID,
                productId: 0x1a85,
                manufacturer: "ASUSTeK",
                product: "ROG Azoth",
                release: 0,
                interface: 1,
                usagePage: ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
                usage: 1,
            },
        ],
        () => [0x12, 0x01, 0x00, 0x00, 0x00, 0x4b, 0x00, 0x01, 0x00],
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].transport, "usbReceiver");
    assert.equal(candidates[0].receiverKind, "unknownReceiver");
});

test("ASUS ROG discovery names Omni keyboard routes from paired product ids", async () => {
    const nativeModule = new FakeNativeHidModule(
        [
            buildOmniDeviceInfo("col01"),
            buildOmniDeviceInfo("col02"),
        ],
        (writtenBytes) => {
            if (writtenBytes[0] === 0x01 && writtenBytes[1] === 0xa0) {
                return [0x01, 0xa0, 0x00, 0x00, 0x00, 0x7a, 0x1b, 0x00, 0x00];
            }

            return [0x02, 0x12, 0x01, 0x00, 0x00, 0x00, 0x5c, 0x02, 0x01, 0x01];
        },
    );
    const discoverer = new AsusRogBatteryReader(nativeModule);

    const candidates = await discoverer.discoverBatteryDevices(nativeModule.devices());

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].displayName, "ROG Strix Scope II 96 RX Wireless");
    assert.equal(candidates[0].identity.modelId, "asus-rog-keyboard:strix-scope-ii-96-rx-wireless");
    assert.equal(candidates[0].receiverKind, "rogOmni");
});

const KNOWN_DIRECT_MOUSE_ROUTE_CASES: ReadonlyArray<{
    readonly productId: number;
    readonly endpointPathToken: string;
    readonly modelId: string;
}> = ASUS_ROG_KNOWN_MOUSE_DIRECT_PID_ROUTES.map((route) => ({
    productId: route.productId,
    endpointPathToken: route.endpointPathToken,
    modelId: route.modelId,
}));

function readRequiredProductId(candidate: {
    readonly identity: { readonly productId?: number };
}): number {
    const productId = candidate.identity.productId;
    if (productId === undefined) {
        throw new assert.AssertionError({
            message: "Expected ASUS ROG candidate productId.",
        });
    }
    return productId;
}

function buildKeyboardDeviceInfo(
    productId = 0x1b78,
    productName = "ROG Strix Scope II 96 RX",
    interfaceNumber = 1,
): NativeHidDeviceInfo {
    return {
        path: `hid#vid_0b05&pid_${productId.toString(16).padStart(4, "0")}&mi_${interfaceNumber
            .toString(16)
            .padStart(2, "0")}`,
        vendorId: ASUS_ROG_VENDOR_ID,
        productId,
        manufacturer: "ASUSTeK",
        product: productName,
        release: 0,
        interface: interfaceNumber,
        usagePage: ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
        usage: 1,
    };
}

function buildMouseDeviceInfo(
    productId = 0x1960,
    endpointPathToken = "mi_00",
): NativeHidDeviceInfo {
    return {
        path: `hid#vid_0b05&pid_${productId.toString(16).padStart(4, "0")}&${endpointPathToken}`,
        vendorId: ASUS_ROG_VENDOR_ID,
        productId,
        manufacturer: "ASUSTeK",
        product: "ROG Keris",
        release: 0,
        interface: 0,
        usagePage: 0xff01,
        usage: 1,
    };
}

function buildOmniDeviceInfo(collection: "col01" | "col02"): NativeHidDeviceInfo {
    return {
        path: `hid#vid_0b05&pid_1ace&mi_02&${collection}#7&2accaf8a&0&000${collection === "col01" ? "0" : "1"}`,
        vendorId: ASUS_ROG_VENDOR_ID,
        productId: 0x1ace,
        manufacturer: "ASUSTeK",
        product: "ASUS ROG Omni Receiver",
        release: 0,
        interface: 2,
        usagePage: ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
        usage: 1,
    };
}

class FakeNativeHidModule implements NativeHidModule {
    readonly HID: new (
        path: string,
        options?: { readonly nonExclusive?: boolean },
    ) => NativeHidDevice;
    openCount = 0;

    constructor(
        private readonly deviceInfoList: readonly NativeHidDeviceInfo[],
        readReport: (writtenBytes: readonly number[]) => readonly number[],
    ) {
        const incrementOpenCount = (): void => {
            this.openCount += 1;
        };
        this.HID = class extends FakeNativeHidDevice {
            constructor(
                path: string,
                options?: { readonly nonExclusive?: boolean },
            ) {
                void path;
                void options;
                incrementOpenCount();
                super(readReport);
            }
        };
    }

    devices(): NativeHidDeviceInfo[] {
        return [...this.deviceInfoList];
    }
}
class FakeNativeHidDevice implements NativeHidDevice {
    private queuedReport: readonly number[] | undefined;

    constructor(
        private readonly readReport: (
            writtenBytes: readonly number[],
        ) => readonly number[],
    ) {}

    close(): void {}

    getFeatureReport(): number[] {
        return [];
    }

    readTimeout(): number[] {
        const report = this.queuedReport;
        this.queuedReport = undefined;
        return report === undefined ? [] : [...report];
    }

    sendFeatureReport(): number {
        return 0;
    }

    write(data: number[] | Buffer): number {
        const bytes = Array.from(data);
        this.queuedReport = this.readReport(bytes);
        return bytes.length;
    }
}

class ThrowingNativeHidModule implements NativeHidModule {
    readonly HID: new (
        path: string,
        options?: { readonly nonExclusive?: boolean },
    ) => NativeHidDevice;
    openCount = 0;

    constructor(
        private readonly deviceInfoList: readonly NativeHidDeviceInfo[],
    ) {
        const incrementOpenCount = (): void => {
            this.openCount += 1;
        };
        this.HID = class implements NativeHidDevice {
            constructor(
                path: string,
                options?: { readonly nonExclusive?: boolean },
            ) {
                void path;
                void options;
                incrementOpenCount();
                throw new Error("open failed");
            }

            close(): void {}

            getFeatureReport(): number[] {
                return [];
            }

            readTimeout(): number[] {
                return [];
            }

            sendFeatureReport(): number {
                return 0;
            }

            write(data: number[] | Buffer): number {
                return data.length;
            }
        };
    }

    devices(): NativeHidDeviceInfo[] {
        return [...this.deviceInfoList];
    }
}

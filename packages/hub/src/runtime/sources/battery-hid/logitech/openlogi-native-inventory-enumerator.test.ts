import assert from "node:assert/strict";
import test from "node:test";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import type { OpenLogiHidppBatteryProbeResult } from "./openlogi-hidpp-battery-reader";
import { OpenLogiHidppBatteryProbeCache } from "./openlogi-hidpp-battery-cache";
import {
    createOpenLogiNativeInventoryRuntime,
    type OpenLogiNativeInventoryCandidate,
    OpenLogiNativeInventoryEnumerator,
    type OpenLogiNativeInventoryOpenedNode,
    type OpenLogiNativeInventoryRuntime,
} from "./openlogi-native-inventory-enumerator";
import {
    LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_VENDOR_ID,
} from "./hidpp-protocol";
import type { OpenLogiReceiverDeviceConnection } from "./openlogi-hidpp-receiver-registers";
import type { OpenLogiReceiverWalkRuntime } from "./openlogi-receiver-walk";

test("OpenLogi native inventory enumerator reuses opened nodes and evicts vanished nodes", () => {
    const runtime = new FakeOpenLogiNativeInventoryRuntime([
        createCandidate("node-1", "direct"),
    ]);
    const enumerator = new OpenLogiNativeInventoryEnumerator(runtime);

    assert.equal(enumerator.enumerateReportingHealth().inventories.length, 1);
    assert.equal(enumerator.enumerateReportingHealth().inventories.length, 1);
    assert.equal(runtime.openCountByNodeKey.get("node-1"), 1);

    runtime.candidates = [];
    assert.deepEqual(enumerator.enumerateReportingHealth(), {
        inventories: [],
        allNodesHealthy: true,
    });
    runtime.candidates = [createCandidate("node-1", "direct")];
    enumerator.enumerateReportingHealth();

    assert.equal(runtime.openCountByNodeKey.get("node-1"), 2);
    assert.equal(runtime.batteryProbeCachesByNodeKey.get("node-1")?.length, 2);
    assert.notEqual(
        runtime.batteryProbeCachesByNodeKey.get("node-1")?.[0],
        runtime.batteryProbeCachesByNodeKey.get("node-1")?.[1],
    );
});

test("OpenLogi native inventory enumerator replays a node snapshot through an open failure", () => {
    const candidate = createCandidate("node-1", "direct");
    const runtime = new FakeOpenLogiNativeInventoryRuntime([candidate]);
    const enumerator = new OpenLogiNativeInventoryEnumerator(runtime);

    const first = enumerator.enumerateReportingHealth();
    runtime.runtimeByNodeKey.get("node-1")?.setProbe({
        state: "noData",
        reason: "timeout",
    });
    enumerator.enumerateReportingHealth();
    enumerator.enumerateReportingHealth();
    runtime.failOpenNodeKeys.add("node-1");
    const second = enumerator.enumerateReportingHealth();

    assert.equal(first.inventories.length, 1);
    assert.deepEqual(second, {
        inventories: first.inventories,
        allNodesHealthy: false,
    });
});

test("OpenLogi native inventory enumerator requests channel eviction after repeated unhealthy probes", () => {
    const candidate = createCandidate("node-1", "direct");
    const runtime = new FakeOpenLogiNativeInventoryRuntime([candidate]);
    const enumerator = new OpenLogiNativeInventoryEnumerator(runtime);

    assert.equal(enumerator.enumerateReportingHealth().inventories.length, 1);
    runtime.runtimeByNodeKey.get("node-1")?.setProbe({
        state: "noData",
        reason: "timeout",
    });
    assert.equal(enumerator.enumerateReportingHealth().allNodesHealthy, false);
    assert.equal(enumerator.enumerateReportingHealth().allNodesHealthy, false);
    enumerator.enumerateReportingHealth();

    assert.equal(runtime.openCountByNodeKey.get("node-1"), 2);
    assert.equal(runtime.batteryProbeCachesByNodeKey.get("node-1")?.length, 2);
    assert.equal(
        runtime.batteryProbeCachesByNodeKey.get("node-1")?.[0],
        runtime.batteryProbeCachesByNodeKey.get("node-1")?.[1],
    );
});

test("OpenLogi node-hid runtime enumerates HID++ long collections and pairs Windows short siblings", () => {
    const nativeHidModule = new FakeNativeHidModule([
        createNativeDevice({
            path: String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col01#7&abc&0&0000#{guid}`,
            product: "Bolt Receiver",
            productId: 0xC548,
            usage: LOGITECH_HIDPP_SHORT_USAGE,
        }),
        createNativeDevice({
            path: String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col02#7&abc&0&0001#{guid}`,
            product: "Bolt Receiver",
            productId: 0xC548,
            usage: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
        }),
        createNativeDevice({
            path: "standard-keyboard",
            vendorId: LOGITECH_HIDPP_VENDOR_ID,
            productId: 0xC548,
            usagePage: 0x0001,
            usage: 0x0006,
        }),
    ]);
    const runtime = createOpenLogiNativeInventoryRuntime(nativeHidModule);

    const candidates = runtime.enumerateCandidates();
    const openedNode = runtime.openNode(
        candidates[0] as OpenLogiNativeInventoryCandidate,
        new OpenLogiHidppBatteryProbeCache(),
    );

    assert.deepEqual(candidates, [{
        nodeKey: "vid_046d&pid_c548&mi_02#7&abc&0",
        name: "Bolt Receiver",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xC548,
        nodeKind: "bolt",
    }]);
    assert.deepEqual(nativeHidModule.openedPaths, [
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col02#7&abc&0&0001#{guid}`,
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col01#7&abc&0&0000#{guid}`,
    ]);

    openedNode?.receiverWalkRuntime.close?.();

    assert.equal(nativeHidModule.openedDevices.every(device => device.closeCount === 1), true);
});

test("OpenLogi node-hid runtime continues long-only when the Windows short sibling cannot open", () => {
    const shortPath = String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col01#7&abc&0&0000#{guid}`;
    const longPath = String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col02#7&abc&0&0001#{guid}`;
    const nativeHidModule = new FakeNativeHidModule([
        createNativeDevice({
            path: shortPath,
            product: "Bolt Receiver",
            productId: 0xC548,
            usage: LOGITECH_HIDPP_SHORT_USAGE,
        }),
        createNativeDevice({
            path: longPath,
            product: "Bolt Receiver",
            productId: 0xC548,
            usage: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
        }),
    ]);
    nativeHidModule.failedOpenPaths.add(shortPath);
    const runtime = createOpenLogiNativeInventoryRuntime(nativeHidModule);
    const candidates = runtime.enumerateCandidates();

    const openedNode = runtime.openNode(
        candidates[0] as OpenLogiNativeInventoryCandidate,
        new OpenLogiHidppBatteryProbeCache(),
    );

    assert.notEqual(openedNode, undefined);
    assert.deepEqual(nativeHidModule.openedPaths, [longPath, shortPath]);

    openedNode?.receiverWalkRuntime.close?.();

    assert.deepEqual(nativeHidModule.openedDevices.map(device => device.closeCount), [1]);
});

test("OpenLogi node-hid runtime skips Linux receiver child nodes", () => {
    const nativeHidModule = new FakeNativeHidModule([
        createNativeDevice({
            path: "/sys/devices/0003:046D:C52B.0009/0003:046D:4076.000A",
            productId: 0x4076,
        }),
    ]);
    const runtime = createOpenLogiNativeInventoryRuntime(nativeHidModule);

    assert.deepEqual(runtime.enumerateCandidates(), []);
});

class FakeOpenLogiNativeInventoryRuntime implements OpenLogiNativeInventoryRuntime {
    readonly openCountByNodeKey = new Map<string, number>();
    readonly runtimeByNodeKey = new Map<string, FakeOpenLogiReceiverWalkRuntime>();
    readonly batteryProbeCachesByNodeKey = new Map<string, OpenLogiHidppBatteryProbeCache[]>();
    readonly failOpenNodeKeys = new Set<string>();

    constructor(public candidates: OpenLogiNativeInventoryCandidate[]) {}

    enumerateCandidates(): readonly OpenLogiNativeInventoryCandidate[] {
        return this.candidates;
    }

    openNode(
        candidate: OpenLogiNativeInventoryCandidate,
        batteryProbeCache: OpenLogiHidppBatteryProbeCache,
    ): OpenLogiNativeInventoryOpenedNode | undefined {
        if (this.failOpenNodeKeys.has(candidate.nodeKey)) {
            return undefined;
        }

        this.openCountByNodeKey.set(candidate.nodeKey, (this.openCountByNodeKey.get(candidate.nodeKey) ?? 0) + 1);
        const batteryProbeCaches = this.batteryProbeCachesByNodeKey.get(candidate.nodeKey) ?? [];
        batteryProbeCaches.push(batteryProbeCache);
        this.batteryProbeCachesByNodeKey.set(candidate.nodeKey, batteryProbeCaches);
        const runtime = new FakeOpenLogiReceiverWalkRuntime(candidate.nodeKey);
        const openedNode = {
            ...candidate,
            receiverWalkRuntime: runtime,
        };
        this.runtimeByNodeKey.set(candidate.nodeKey, runtime);
        return openedNode;
    }
}

class FakeNativeHidModule implements NativeHidModule {
    readonly openedDevices: FakeNativeHidDevice[] = [];
    readonly openedPaths: string[] = [];
    readonly failedOpenPaths = new Set<string>();
    readonly HID: NativeHidModule["HID"];

    constructor(private readonly deviceList: readonly NativeHidDeviceInfo[]) {
        this.HID = createFakeNativeHidConstructor(path => this.openDevice(path));
    }

    devices(): NativeHidDeviceInfo[] {
        return [...this.deviceList];
    }

    private openDevice(path: string): FakeNativeHidDevice {
        this.openedPaths.push(path);
        if (this.failedOpenPaths.has(path)) {
            throw new Error(`Failed to open ${path}`);
        }

        const device = new FakeNativeHidDevice();
        this.openedDevices.push(device);
        return device;
    }
}

function createFakeNativeHidConstructor(
    openDevice: (path: string) => FakeNativeHidDevice,
): NativeHidModule["HID"] {
    return class {
        constructor(path: string) {
            return openDevice(path);
        }
    } as NativeHidModule["HID"];
}

class FakeNativeHidDevice implements NativeHidDevice {
    closeCount = 0;

    close(): void {
        this.closeCount += 1;
    }

    readTimeout(): number[] {
        return [];
    }

    write(data: number[] | Buffer): number {
        return data.length;
    }

    getFeatureReport(): number[] {
        throw new Error("OpenLogi node-hid runtime tests do not use feature reports.");
    }

    sendFeatureReport(): number {
        throw new Error("OpenLogi node-hid runtime tests do not use feature reports.");
    }
}

function createNativeDevice(overrides: Partial<NativeHidDeviceInfo>): NativeHidDeviceInfo {
    return {
        path: "hid-node",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xC094,
        product: "Logitech Device",
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usage: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
        ...overrides,
    } as NativeHidDeviceInfo;
}

class FakeOpenLogiReceiverWalkRuntime implements OpenLogiReceiverWalkRuntime {
    readonly evictedCacheKeys: ReadonlySet<string>[] = [];
    private probe: OpenLogiHidppBatteryProbeResult = {
        state: "probe",
        probe: {
            deviceKind: "mouse",
            battery: {
                percentage: 80,
                level: "full",
                status: "discharging",
            },
            capabilities: {
                buttons: false,
                pointer: false,
                lighting: false,
            },
        },
    };

    constructor(private readonly nodeKey: string) {}

    setProbe(probe: OpenLogiHidppBatteryProbeResult): void {
        this.probe = probe;
    }

    exchange(): never {
        throw new Error("Direct-node enumerator tests do not use receiver register exchange.");
    }

    drainReceiverConnectionEvents(): readonly OpenLogiReceiverDeviceConnection[] | undefined {
        throw new Error("Direct-node enumerator tests do not use receiver arrival drains.");
    }

    readBatteryProbe(input: Parameters<OpenLogiReceiverWalkRuntime["readBatteryProbe"]>[0]): OpenLogiHidppBatteryProbeResult {
        assert.equal(input.cacheKey, `direct:${this.nodeKey}`);
        return this.probe;
    }

    evictUnseenBatteryProbeCache(seenCacheKeys: ReadonlySet<string>): void {
        this.evictedCacheKeys.push(new Set(seenCacheKeys));
    }
}

function createCandidate(
    nodeKey: string,
    nodeKind: OpenLogiNativeInventoryCandidate["nodeKind"],
): OpenLogiNativeInventoryCandidate {
    return {
        nodeKey,
        nodeKind,
        name: `Device ${nodeKey}`,
        vendorId: 0x046D,
        productId: 0xC094,
    };
}

import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricUnit, type MetricValue } from "../metric-source";
import type { NativeHidDevice, NativeHidDeviceInfo, NativeHidModule } from "./native-hid-loader-internal";
import { VENDOR_HID_BATTERY_SOURCE_ID } from "../source-ids";
import { buildBatteryMetricKeyFromIdentity } from "../battery/battery-metric-key";
import type { BatteryDeviceDiscoveryCandidate } from "../battery/battery-device-discovery";
import type {
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemVendorHidPeripheralIdentity,
} from "../../../settings/resolved-settings";
import {
    VendorHidBatterySourceClient,
    discoverVendorHidBatteryCandidatesFromReaders,
    readVendorHidBatteryDeviceDescriptorSnapshot,
    readVendorHidBatteryDeviceDescriptors,
} from "./vendor-hid-battery-source-client";
import { VendorHidBatteryRouteRegistry } from "./vendor-hid-battery-route-registry";

test("vendor HID battery source does not load native HID during construction or planning", () => {
    let loadNativeHidCalls = 0;
    const client = new VendorHidBatterySourceClient({
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "unavailable", error: new Error("unexpected") };
        },
    });

    const pollingGroups = client.resolveMetricPollingGroups([buildTestMetricKey(), "cpu.usage_percent"]);

    assert.equal(client.sourceId, VENDOR_HID_BATTERY_SOURCE_ID);
    assert.equal(loadNativeHidCalls, 0);
    assert.deepEqual(pollingGroups.get(buildTestMetricKey()), {
        state: "owned",
        pollingGroupId: "vendor-hid-battery",
    });
    assert.deepEqual(pollingGroups.get("cpu.usage_percent"), { state: "unsupported" });
});

test("vendor HID battery source leaves status unchanged when no vendor battery keys are requested", async () => {
    let loadNativeHidCalls = 0;
    const client = new VendorHidBatterySourceClient({
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "unavailable", error: new Error("unexpected") };
        },
        wallClockNow: () => 1122,
    });

    const result = await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(loadNativeHidCalls, 0);
    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, []);
    assert.deepEqual(client.getCachedStatus(), { state: "unknown" });
});

test("vendor HID battery source returns no scalar and does not load native HID when disabled", async () => {
    let loadNativeHidCalls = 0;
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => false,
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "loaded", module: fakeNativeHidModule };
        },
        wallClockNow: () => 1234,
    });

    const result = await client.readSnapshot([buildTestMetricKey()]);

    assert.equal(loadNativeHidCalls, 0);
    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: buildTestMetricKey(),
        reason: "noSourceReading",
    }]);
    assert.deepEqual(client.getCachedStatus(), { state: "unsupported" });
});

test("vendor HID battery source maps discovered candidate battery percent to requested metric", async () => {
    const candidate = buildTestCandidate({ batteryPercent: 87 });
    let loadNativeHidCalls = 0;
    let discoverCandidatesCalls = 0;
    let devicesCalls = 0;
    const deviceInfoList = [buildNativeHidDeviceInfo({ path: "test-path" })];
    const nativeHidModule = {
        ...fakeNativeHidModule,
        devices: () => {
            devicesCalls += 1;
            return deviceInfoList;
        },
    } satisfies NativeHidModule;
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "loaded", module: nativeHidModule };
        },
        discoverCandidates: (_nativeHidModule, discoveredDeviceInfoList) => {
            discoverCandidatesCalls += 1;
            assert.deepEqual(discoveredDeviceInfoList, deviceInfoList);
            return Promise.resolve([candidate]);
        },
        wallClockNow: () => 2345,
    });

    const result = await client.readSnapshot([buildTestMetricKey()]);

    assert.equal(loadNativeHidCalls, 1);
    assert.equal(devicesCalls, 1);
    assert.equal(discoverCandidatesCalls, 1);
    assert.equal(readScalarMetricValue(result.snapshot.metrics[buildTestMetricKey()]), 87);
    assert.equal(result.snapshot.metrics[buildTestMetricKey()]?.unit, MetricUnit.PERCENT);
    assert.deepEqual(result.unavailableMetrics, []);
    assert.deepEqual(result.valueMetadata[0]?.displayHint, {
        label: "Logitech Test Mouse",
        unit: MetricUnit.PERCENT,
        maximum: 100,
    });
    assert.equal(result.valueMetadata[0]?.rawSensorIdentity?.hardwareName, "Logitech Test Mouse");
    assert.equal(client.getCachedStatus().state, "available");
});

test("vendor HID battery source does not emit a scalar for ambiguous metric keys", async () => {
    const firstCandidate = buildTestCandidate({
        candidateId: "receiver-route",
        batteryPercent: 87,
    });
    const secondCandidate = buildTestCandidate({
        candidateId: "wired-route",
        batteryPercent: 42,
    });
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => ({ state: "loaded", module: fakeNativeHidModule }),
        discoverCandidates: () => Promise.resolve([firstCandidate, secondCandidate]),
        wallClockNow: () => 2345,
    });

    const result = await client.readSnapshot([buildTestMetricKey()]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.valueMetadata, []);
    assert.equal(result.unavailableMetrics.length, 1);
    assert.equal(result.unavailableMetrics[0]?.metricId, buildTestMetricKey());
    assert.equal(result.unavailableMetrics[0]?.reason, "noSourceReading");
});

test("vendor HID battery source defers full discovery when no selected route is registered", async () => {
    let loadNativeHidCalls = 0;
    const routeRegistry = new VendorHidBatteryRouteRegistry();
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "loaded", module: fakeNativeHidModule };
        },
        routeRegistry,
        deferredFullDiscoveryDelayMilliseconds: 60_000,
        wallClockNow: () => 2345,
    });

    const result = await client.readSnapshot([buildTestMetricKey()]);

    assert.equal(loadNativeHidCalls, 0);
    assert.deepEqual(result.snapshot.metrics, {});
    assert.equal(result.unavailableMetrics[0]?.metricId, buildTestMetricKey());
    assert.equal(result.unavailableMetrics[0]?.reason, "noSourceReading");
    client.dispose();
});

test("vendor HID battery source reads selected bindings without re-enumerating HID devices", async () => {
    const firstCandidate = buildTestCandidate({ batteryPercent: 87 });
    const selectedCandidate = buildTestCandidate({ batteryPercent: 89 });
    let devicesCalls = 0;
    let discoverCalls = 0;
    let selectedReadCalls = 0;
    let selectedRouteReadCalls = 0;
    const nativeHidModule = {
        ...fakeNativeHidModule,
        devices: () => {
            devicesCalls += 1;
            return [buildNativeHidDeviceInfo({ path: "test-path" })];
        },
    } satisfies NativeHidModule;
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => ({ state: "loaded", module: nativeHidModule }),
        createReaders: () => [{
            name: "testVendor",
            reader: {
                discoverBatteryDevices: () => {
                    discoverCalls += 1;
                    return Promise.resolve([firstCandidate]);
                },
                readBatteryDeviceFromIdentity: (metricKey) => {
                    selectedRouteReadCalls += 1;
                    return Promise.resolve(metricKey === buildTestMetricKey() ? firstCandidate : undefined);
                },
                readBatteryDevice: (metricKey) => {
                    selectedReadCalls += 1;
                    return Promise.resolve(metricKey === buildTestMetricKey() ? selectedCandidate : undefined);
                },
            },
        }],
        routeRegistry: buildTestRouteRegistry(),
        wallClockNow: () => 2345,
    });

    await client.readSnapshot([buildTestMetricKey()]);
    const selectedResult = await client.readSnapshot([buildTestMetricKey()]);

    assert.equal(devicesCalls, 1);
    assert.equal(discoverCalls, 0);
    assert.equal(selectedRouteReadCalls, 1);
    assert.equal(selectedReadCalls, 1);
    assert.equal(readScalarMetricValue(selectedResult.snapshot.metrics[buildTestMetricKey()]), 89);
});

test("vendor HID battery source keeps selected reads cheap when another requested device is offline", async () => {
    const firstCandidate = buildTestCandidate({ batteryPercent: 87 });
    const selectedCandidate = buildTestCandidate({ batteryPercent: 89 });
    const offlineMetricKey = buildBatteryMetricKeyFromIdentity(buildTestIdentity({
        vendorUnitId: "offline-unit",
        modelId: "offline-device",
    }));
    let devicesCalls = 0;
    let discoverCalls = 0;
    let selectedReadCalls = 0;
    let selectedRouteReadCalls = 0;
    const nativeHidModule = {
        ...fakeNativeHidModule,
        devices: () => {
            devicesCalls += 1;
            return [buildNativeHidDeviceInfo({ path: "test-path" })];
        },
    } satisfies NativeHidModule;
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => ({ state: "loaded", module: nativeHidModule }),
        createReaders: () => [{
            name: "testVendor",
            reader: {
                discoverBatteryDevices: () => {
                    discoverCalls += 1;
                    return Promise.resolve([firstCandidate]);
                },
                readBatteryDeviceFromIdentity: (metricKey) => {
                    selectedRouteReadCalls += 1;
                    return Promise.resolve(metricKey === buildTestMetricKey() ? firstCandidate : undefined);
                },
                readBatteryDevice: (metricKey) => {
                    selectedReadCalls += 1;
                    return Promise.resolve(metricKey === buildTestMetricKey() ? selectedCandidate : undefined);
                },
            },
        }],
        routeRegistry: buildTestRouteRegistry(),
        wallClockNow: () => 2345,
    });

    await client.readSnapshot([buildTestMetricKey(), offlineMetricKey]);
    const selectedResult = await client.readSnapshot([buildTestMetricKey(), offlineMetricKey]);

    assert.equal(devicesCalls, 1);
    assert.equal(discoverCalls, 0);
    assert.equal(selectedRouteReadCalls, 1);
    assert.equal(selectedReadCalls, 1);
    assert.equal(readScalarMetricValue(selectedResult.snapshot.metrics[buildTestMetricKey()]), 89);
    assert.equal(selectedResult.unavailableMetrics[0]?.metricId, offlineMetricKey);
    assert.equal(selectedResult.unavailableMetrics[0]?.reason, "noSourceReading");
});

test("vendor HID battery source reports selected read failures without re-running full discovery", async () => {
    const firstCandidate = buildTestCandidate({ batteryPercent: 87 });
    const mismatchedCandidate = buildTestCandidate({
        batteryPercent: 42,
        identity: buildTestIdentity({
            vendorUnitId: "other-unit",
        }),
    });
    let devicesCalls = 0;
    let discoverCalls = 0;
    let selectedRouteReadCalls = 0;
    const nativeHidModule = {
        ...fakeNativeHidModule,
        devices: () => {
            devicesCalls += 1;
            return [buildNativeHidDeviceInfo({ path: "test-path" })];
        },
    } satisfies NativeHidModule;
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => ({ state: "loaded", module: nativeHidModule }),
        createReaders: () => [{
            name: "testVendor",
            reader: {
                discoverBatteryDevices: () => {
                    discoverCalls += 1;
                    return Promise.resolve([firstCandidate]);
                },
                readBatteryDeviceFromIdentity: (metricKey) => {
                    selectedRouteReadCalls += 1;
                    return Promise.resolve(metricKey === buildTestMetricKey() ? firstCandidate : undefined);
                },
                readBatteryDevice: () => Promise.resolve(mismatchedCandidate),
            },
        }],
        routeRegistry: buildTestRouteRegistry(),
        wallClockNow: () => 2345,
    });

    await client.readSnapshot([buildTestMetricKey()]);
    const selectedResult = await client.readSnapshot([buildTestMetricKey()]);

    assert.equal(devicesCalls, 1);
    assert.equal(discoverCalls, 0);
    assert.equal(selectedRouteReadCalls, 1);
    assert.equal(readScalarMetricValue(selectedResult.snapshot.metrics[buildTestMetricKey()]), undefined);
    assert.equal(selectedResult.unavailableMetrics[0]?.metricId, buildTestMetricKey());
    assert.equal(selectedResult.unavailableMetrics[0]?.reason, "noSourceReading");
});

test("vendor HID battery source omits scalar when native HID is unavailable", async () => {
    const client = new VendorHidBatterySourceClient({
        isExperimentalVendorHidEnabled: () => true,
        loadNativeHid: () => ({ state: "unavailable", error: new Error("missing addon") }),
        routeRegistry: buildTestRouteRegistry(),
        wallClockNow: () => 3456,
    });

    const result = await client.readSnapshot([buildTestMetricKey()]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: buildTestMetricKey(),
        reason: "noSourceReading",
    }]);
    assert.deepEqual(client.getCachedStatus(), {
        state: "unavailable",
        reason: "driverUnavailable",
        lastFailureAtTimestampMilliseconds: 3456,
        lastErrorMessage: "missing addon",
    });
});

test("vendor HID descriptor discovery respects the experimental toggle before native loading", async () => {
    let loadNativeHidCalls = 0;

    const descriptors = await readVendorHidBatteryDeviceDescriptors({
        isExperimentalVendorHidEnabled: false,
        loadNativeHid: () => {
            loadNativeHidCalls += 1;
            return { state: "loaded", module: fakeNativeHidModule };
        },
    });

    assert.deepEqual(descriptors, []);
    assert.equal(loadNativeHidCalls, 0);
});

test("vendor HID descriptor discovery resolves descriptors from discovered candidates", async () => {
    const candidate = buildTestCandidate({ batteryPercent: 55 });

    const descriptors = await readVendorHidBatteryDeviceDescriptors({
        isExperimentalVendorHidEnabled: true,
        loadNativeHid: () => ({ state: "loaded", module: fakeNativeHidModule }),
        discoverCandidates: () => Promise.resolve([candidate]),
    });

    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0]?.displayName, "Logitech Test Mouse");
    assert.equal(descriptors[0]?.metricKey, buildTestMetricKey());
});

test("vendor HID descriptor discovery returns diagnostics for hidden candidates", async () => {
    const candidate = buildTestCandidate({
        batteryPercent: undefined,
        supportState: "unsupported",
    });

    const snapshot = await readVendorHidBatteryDeviceDescriptorSnapshot({
        isExperimentalVendorHidEnabled: true,
        loadNativeHid: () => ({ state: "loaded", module: fakeNativeHidModule }),
        discoverCandidates: () => Promise.resolve([candidate]),
    });

    assert.deepEqual(snapshot.descriptors, []);
    assert.equal(snapshot.diagnostics.detectedCandidateCount, 1);
    assert.equal(snapshot.diagnostics.displayedDescriptorCount, 0);
    assert.equal(snapshot.diagnostics.hiddenCandidates[0]?.candidateId, "logitech-test-candidate");
    assert.equal(snapshot.diagnostics.hiddenCandidates[0]?.reason, "unsupported");
});

test("vendor HID candidate discovery keeps successful vendor candidates when another vendor fails", async () => {
    const candidate = buildTestCandidate({ batteryPercent: 67 });

    const candidates = await discoverVendorHidBatteryCandidatesFromReaders([
        {
            name: "failingVendor",
            reader: {
                discoverBatteryDevices: () => Promise.reject(new Error("native open failed")),
                readBatteryDevice: () => Promise.resolve(undefined),
            },
        },
        {
            name: "workingVendor",
            reader: {
                discoverBatteryDevices: () => Promise.resolve([candidate]),
                readBatteryDevice: () => Promise.resolve(undefined),
            },
        },
    ], []);

    assert.deepEqual(candidates, [candidate]);
});

function buildTestCandidate(options: {
    readonly candidateId?: string;
    readonly batteryPercent: number | undefined;
    readonly supportState?: BatteryDeviceDiscoveryCandidate["supportState"];
    readonly identity?: BatteryDeviceDiscoveryCandidate["identity"];
}): BatteryDeviceDiscoveryCandidate {
    return {
        candidateId: options.candidateId ?? "logitech-test-candidate",
        displayName: "Logitech Test Mouse",
        transport: "usbReceiver",
        receiverKind: "bolt",
        identity: options.identity ?? testIdentity,
        supportState: options.supportState ?? "experimental",
        isExperimental: true,
        batteryPercent: options.batteryPercent,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: "path:test",
            receiverSlot: 1,
            batteryPercentSource: "reported",
        },
    };
}

function buildTestMetricKey(): string {
    return buildBatteryMetricKeyFromIdentity(testIdentity);
}

function buildTestRouteRegistry(): VendorHidBatteryRouteRegistry {
    const routeRegistry = new VendorHidBatteryRouteRegistry();
    routeRegistry.register({
        metricKey: buildTestMetricKey(),
        identity: testIdentity,
        ownerId: "test-action",
    });
    return routeRegistry;
}

function readScalarMetricValue(metricValue: MetricValue | undefined): number | undefined {
    return metricValue?.value.case === "scalar" ? metricValue.value.value : undefined;
}

function buildNativeHidDeviceInfo(overrides: Partial<NativeHidDeviceInfo> = {}): NativeHidDeviceInfo {
    return {
        vendorId: 0x046D,
        productId: 0xC548,
        release: 0,
        interface: 0,
        path: undefined,
        ...overrides,
    } satisfies NativeHidDeviceInfo;
}

function buildTestIdentity(
    overrides: Partial<ResolvedSystemVendorHidPeripheralIdentity> = {},
): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "vendorHid",
            vendorId: 0x046D,
            productId: 0xC548,
            manufacturer: "Logitech",
            productName: "Test Mouse",
            serialNumber: undefined,
            interfaceNumber: 2,
            usagePage: 0xFF00,
            usageId: undefined,
            bindingTransport: "usbReceiver",
            receiverKind: "bolt",
            vendorUnitId: "unit-test",
            modelId: "test-mouse",
            receiverSlot: 1,
            ...overrides,
        },
    };
}

const testIdentity = buildTestIdentity();

class FakeNativeHidDevice implements NativeHidDevice {
    constructor(readonly path: string) {}

    close(): void {}

    readTimeout(): number[] {
        return [];
    }

    write(): number {
        return 0;
    }

    getFeatureReport(): number[] {
        return [];
    }

    sendFeatureReport(): number {
        return 0;
    }
}

const fakeNativeHidModule = {
    HID: FakeNativeHidDevice,
    devices: (): NativeHidDeviceInfo[] => [],
} satisfies NativeHidModule;

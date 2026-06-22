import assert from "node:assert/strict";
import { test } from "vitest";
import {
    BatteryDeviceDiscoveryService,
    resolveBatteryDeviceDescriptors,
    type BatteryDeviceDiscoveryCandidate,
} from "./battery-device-discovery";
import { buildBatteryMetricKeyFromIdentity } from "./battery-metric-key";
import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";

test("battery discovery coalesces paths with the same vendor unit id", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "bolt-slot-2",
            transport: "usbReceiver",
            receiverKind: "bolt",
            receiverSlot: 2,
            vendorUnitId: "unit-2",
        }),
        buildCandidate({
            candidateId: "wired",
            transport: "usbWired",
            receiverKind: undefined,
            receiverSlot: undefined,
            vendorUnitId: "unit-2",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].diagnostics?.coalescing, "unitId");
    assert.deepEqual(descriptors[0].diagnostics?.candidateIds, ["bolt-slot-2", "wired"]);
});

test("battery discovery uses unique candidate fallback only when one current candidate matches", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "only-mx-master",
            vendorUnitId: undefined,
            serialNumber: undefined,
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].supportState, "supported");
    assert.equal(descriptors[0].diagnostics?.coalescing, "uniqueCandidateFallback");
});

test("battery discovery keeps duplicate candidate fallback matches separate and ambiguous", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "slot-1",
            vendorUnitId: undefined,
            serialNumber: undefined,
            receiverSlot: 1,
        }),
        buildCandidate({
            candidateId: "slot-2",
            vendorUnitId: undefined,
            serialNumber: undefined,
            receiverSlot: 2,
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.supportState),
        ["ambiguous", "ambiguous"],
    );
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.diagnostics?.coalescing),
        ["duplicateCandidateFallback", "duplicateCandidateFallback"],
    );
    assert.notEqual(descriptors[0].descriptorId, descriptors[1].descriptorId);
    assert.equal(descriptors[0].metricKey, descriptors[1].metricKey);
    const firstDescriptorIdentity = descriptors[0].identity;
    if (firstDescriptorIdentity === undefined) {
        throw new Error("Expected duplicate fallback descriptor to keep a binding identity.");
    }

    assert.equal(descriptors[0].metricKey, buildBatteryMetricKeyFromIdentity(firstDescriptorIdentity));
});

test("battery discovery does not coalesce untrusted shared serial numbers", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "first",
            vendorUnitId: undefined,
            serialNumber: "000000",
        }),
        buildCandidate({
            candidateId: "second",
            vendorUnitId: undefined,
            serialNumber: "000000",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.supportState),
        ["ambiguous", "ambiguous"],
    );
});

test("battery discovery does not treat receiver slot as primary identity", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "receiver-slot-1",
            receiverSlot: 1,
            vendorUnitId: "unit-2",
        }),
        buildCandidate({
            candidateId: "receiver-slot-3",
            receiverSlot: 3,
            vendorUnitId: "unit-2",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.deepEqual(descriptors[0].diagnostics?.receiverSlots, [1, 3]);
});

test("battery discovery keeps descriptor keys stable across route-local field changes", () => {
    const receiverCandidate = buildCandidate({
        candidateId: "receiver",
        transport: "usbReceiver",
        receiverKind: "bolt",
        receiverSlot: 2,
        vendorUnitId: "unit-2",
    });
    const bluetoothCandidate: BatteryDeviceDiscoveryCandidate = {
        ...buildCandidate({
            candidateId: "bluetooth",
            transport: "bluetooth",
            receiverKind: undefined,
            receiverSlot: undefined,
            vendorUnitId: "unit-2",
        }),
        displayName: "MX Master 4 Bluetooth",
        identity: {
            ...receiverCandidate.identity,
            productId: 0xBEEF,
            productName: "MX Master 4 Bluetooth",
            interfaceNumber: undefined,
            usagePage: undefined,
            usageId: undefined,
            bindingTransport: "bluetooth",
            receiverKind: undefined,
            receiverSlot: undefined,
        },
    };

    const receiverDescriptors = resolveBatteryDeviceDescriptors([receiverCandidate], enabledDiscoveryOptions());
    const bluetoothDescriptors = resolveBatteryDeviceDescriptors([bluetoothCandidate], enabledDiscoveryOptions());

    assert.equal(receiverDescriptors[0].descriptorId, bluetoothDescriptors[0].descriptorId);
    assert.equal(receiverDescriptors[0].metricKey, bluetoothDescriptors[0].metricKey);
});

test("battery discovery keeps Easy-Switch slot as diagnostics only", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "host-1",
            easySwitchSlot: 1,
            vendorUnitId: "unit-2",
        }),
        buildCandidate({
            candidateId: "host-3",
            easySwitchSlot: 3,
            vendorUnitId: "unit-2",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.deepEqual(descriptors[0].diagnostics?.easySwitchSlots, [1, 3]);
    assert.deepEqual(descriptors[0].diagnostics?.candidateIds, ["host-1", "host-3"]);
});

test("battery discovery prefers fresh Bluetooth telemetry over receiver telemetry for display route", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "bolt",
            transport: "usbReceiver",
            receiverKind: "bolt",
            vendorUnitId: "unit-2",
            isExperimental: true,
            batteryTelemetryFreshness: "fresh",
        }),
        buildCandidate({
            candidateId: "bluetooth",
            transport: "bluetooth",
            receiverKind: undefined,
            vendorUnitId: "unit-2",
            isExperimental: false,
            batteryTelemetryFreshness: "fresh",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].transport, "bluetooth");
    assert.equal(descriptors[0].isExperimental, false);
    assert.equal(descriptors[0].descriptorId.includes("receiver"), false);
});

test("battery discovery keeps binding identity stable when display route changes freshness", () => {
    const routeRule = {
        ruleId: "same-device",
        matches: (left: BatteryDeviceDiscoveryCandidate, right: BatteryDeviceDiscoveryCandidate) =>
            [left.candidateId, right.candidateId].sort().join(":") === "bluetooth:receiver",
    };
    const receiverCandidate = buildCandidate({
        candidateId: "receiver",
        transport: "usbReceiver",
        receiverKind: "bolt",
        vendorUnitId: "unit-2",
        batteryTelemetryFreshness: "fresh",
    });
    const freshBluetoothCandidate = buildCandidate({
        candidateId: "bluetooth",
        transport: "bluetooth",
        receiverKind: undefined,
        vendorUnitId: undefined,
        serialNumber: "serial-2",
        batteryTelemetryFreshness: "fresh",
    });
    const staleBluetoothCandidate = {
        ...freshBluetoothCandidate,
        batteryTelemetryFreshness: "stale" as const,
    };

    const freshDescriptors = resolveBatteryDeviceDescriptors([
        receiverCandidate,
        freshBluetoothCandidate,
    ], {
        ...enabledDiscoveryOptions(),
        verifiedRouteRules: [routeRule],
    });
    const staleDescriptors = resolveBatteryDeviceDescriptors([
        receiverCandidate,
        staleBluetoothCandidate,
    ], {
        ...enabledDiscoveryOptions(),
        verifiedRouteRules: [routeRule],
    });

    assert.equal(freshDescriptors[0].transport, "bluetooth");
    assert.equal(staleDescriptors[0].transport, "usbReceiver");
    assert.equal(freshDescriptors[0].descriptorId, staleDescriptors[0].descriptorId);
    assert.equal(freshDescriptors[0].metricKey, staleDescriptors[0].metricKey);
    assert.equal(freshDescriptors[0].identity?.vendorUnitId, "unit-2");
});

test("battery discovery splits coalesced paths after repeated large conflicts", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "bolt",
            transport: "usbReceiver",
            receiverKind: "bolt",
            vendorUnitId: "unit-2",
        }),
        buildCandidate({
            candidateId: "wired",
            transport: "usbWired",
            receiverKind: undefined,
            vendorUnitId: "unit-2",
        }),
    ], {
        ...enabledDiscoveryOptions(),
        conflictEvidence: [{
            candidateIds: ["bolt", "wired"],
            repeatedLargeDisagreement: true,
        }],
    });

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.diagnostics?.coalescing),
        ["conflictSplit", "conflictSplit"],
    );
});

test("battery discovery hides unsupported and unknown devices", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({ candidateId: "supported" }),
        buildCandidate({ candidateId: "unsupported", supportState: "unsupported" }),
        buildCandidate({ candidateId: "unknown", supportState: "unknown" }),
    ], enabledDiscoveryOptions());

    assert.deepEqual(descriptors.map(descriptor => descriptor.diagnostics?.candidateIds), [["supported"]]);
});

test("battery discovery hides experimental vendor HID descriptors when disabled", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "bluetooth",
            transport: "bluetooth",
            isExperimental: false,
        }),
        buildCandidate({
            candidateId: "bolt",
            transport: "usbReceiver",
            receiverKind: "bolt",
            isExperimental: true,
        }),
    ], {
        ...enabledDiscoveryOptions(),
        isExperimentalVendorHidEnabled: false,
    });

    assert.deepEqual(descriptors.map(descriptor => descriptor.transport), ["bluetooth"]);
});

test("battery discovery service returns descriptors from multiple discoverers", async () => {
    const service = new BatteryDeviceDiscoveryService([
        {
            discoverBatteryDevices: () => Promise.resolve([buildCandidate({
                candidateId: "bluetooth",
                transport: "bluetooth",
                vendorUnitId: "unit-bluetooth",
            })]),
        },
        {
            discoverBatteryDevices: () => Promise.resolve([buildCandidate({
                candidateId: "wired",
                transport: "usbWired",
                vendorUnitId: "unit-wired",
            })]),
        },
    ]);

    const descriptors = await service.discoverBatteryDevices(enabledDiscoveryOptions());

    assert.deepEqual(descriptors.map(descriptor => descriptor.transport), ["bluetooth", "usbWired"]);
});

function enabledDiscoveryOptions(): Parameters<typeof resolveBatteryDeviceDescriptors>[1] {
    return {
        isExperimentalVendorHidEnabled: true,
    };
}

function buildCandidate(
    overrides: Partial<BatteryDeviceDiscoveryCandidate> & {
        readonly vendorUnitId?: string;
        readonly serialNumber?: string;
        readonly transport?: SystemPeripheralBindingTransport;
        readonly receiverKind?: SystemPeripheralReceiverKind;
        readonly receiverSlot?: number;
        readonly easySwitchSlot?: number;
    },
): BatteryDeviceDiscoveryCandidate {
    const transport = overrides.transport ?? "usbReceiver";
    const receiverKind = overrides.receiverKind ?? (transport === "usbReceiver" ? "bolt" : undefined);
    const identity = buildIdentity({
        bindingTransport: transport,
        receiverKind,
        vendorUnitId: overrides.vendorUnitId,
        serialNumber: overrides.serialNumber,
        receiverSlot: overrides.receiverSlot,
    });

    return {
        candidateId: overrides.candidateId ?? "candidate",
        displayName: overrides.displayName ?? "MX Master 4",
        transport,
        receiverKind,
        identity,
        supportState: overrides.supportState ?? "supported",
        isExperimental: overrides.isExperimental ?? transport !== "bluetooth",
        batteryTelemetryFreshness: overrides.batteryTelemetryFreshness ?? "unavailable",
        diagnostics: {
            sourcePathId: overrides.diagnostics?.sourcePathId ?? `${overrides.candidateId ?? "candidate"}-path`,
            receiverSlot: overrides.receiverSlot,
            easySwitchSlot: overrides.easySwitchSlot,
        },
    };
}

function buildIdentity(overrides: Partial<ResolvedSystemPeripheralIdentity>): ResolvedSystemPeripheralIdentity {
    return {
        vendorId: 0x046D,
        productId: 0xC548,
        manufacturer: "Logitech",
        productName: "MX Master 4",
        serialNumber: "serial-2",
        interfaceNumber: 2,
        usagePage: 0xFF00,
        usageId: undefined,
        bindingTransport: "usbReceiver",
        receiverKind: "bolt",
        vendorUnitId: "unit-2",
        modelId: "mx-master-4",
        receiverSlot: 2,
        ...overrides,
    };
}

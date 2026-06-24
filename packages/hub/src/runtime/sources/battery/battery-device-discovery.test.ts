import assert from "node:assert/strict";
import { test } from "vitest";
import {
    BatteryDeviceDiscoveryService,
    buildBatteryDeviceDiscoveryDiagnostics,
    resolveBatteryDeviceDescriptors,
    type BatteryDeviceDiscoveryCandidate,
} from "./battery-device-discovery";
import { buildBatteryMetricKeyFromIdentity } from "./battery-metric-key";
import type {
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemVendorHidPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";

test("battery discovery keeps one descriptor per candidate even with the same vendor unit id", () => {
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

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.supportState),
        ["ambiguous", "ambiguous"],
    );
    assert.notEqual(descriptors[0].descriptorId, descriptors[1].descriptorId);
    assert.equal(descriptors[0].metricKey, descriptors[1].metricKey);
});

test("battery discovery keeps a unique candidate supported", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "only-mx-master",
            vendorUnitId: undefined,
            serialNumber: undefined,
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].supportState, "supported");
    assert.deepEqual(descriptors[0].diagnostics?.candidateIds, ["only-mx-master"]);
});

test("battery discovery keeps duplicate fallback matches separate and ambiguous", () => {
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
    assert.notEqual(descriptors[0].descriptorId, descriptors[1].descriptorId);
    assert.equal(descriptors[0].metricKey, descriptors[1].metricKey);
    const firstDescriptorIdentity = descriptors[0].identity;
    if (firstDescriptorIdentity === undefined) {
        throw new Error("Expected duplicate fallback descriptor to keep a binding identity.");
    }

    assert.equal(descriptors[0].metricKey, buildBatteryMetricKeyFromIdentity(firstDescriptorIdentity));
});

test("battery discovery keeps duplicate descriptor ids unique when sanitized candidate ids collide", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "slot 1",
            vendorUnitId: "same-unit",
        }),
        buildCandidate({
            candidateId: "slot+1",
            vendorUnitId: "same-unit",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors.map(descriptor => descriptor.supportState),
        ["ambiguous", "ambiguous"],
    );
    assert.notEqual(descriptors[0].descriptorId, descriptors[1].descriptorId);
    assert.match(descriptors[0].descriptorId, /\.candidate-slot-1-[0-9a-f]{8}$/u);
    assert.match(descriptors[1].descriptorId, /\.candidate-slot-1-[0-9a-f]{8}$/u);
});

test("battery discovery does not treat shared serial numbers as unique candidates", () => {
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

test("battery discovery keeps receiver slot as diagnostics only", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "receiver-slot-1",
            receiverSlot: 1,
            vendorUnitId: "unit-1",
        }),
        buildCandidate({
            candidateId: "receiver-slot-3",
            receiverSlot: 3,
            vendorUnitId: "unit-3",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors
            .map(descriptor => descriptor.diagnostics?.receiverSlots)
            .sort(compareNumberArrays),
        [[1], [3]],
    );
});

test("battery discovery keeps Easy-Switch slot as diagnostics only", () => {
    const descriptors = resolveBatteryDeviceDescriptors([
        buildCandidate({
            candidateId: "host-1",
            easySwitchSlot: 1,
            vendorUnitId: "unit-1",
        }),
        buildCandidate({
            candidateId: "host-3",
            easySwitchSlot: 3,
            vendorUnitId: "unit-3",
        }),
    ], enabledDiscoveryOptions());

    assert.equal(descriptors.length, 2);
    assert.deepEqual(
        descriptors
            .map(descriptor => descriptor.diagnostics?.easySwitchSlots)
            .sort(compareNumberArrays),
        [[1], [3]],
    );
    assert.deepEqual(
        descriptors
            .map(descriptor => descriptor.diagnostics?.candidateIds)
            .sort(compareStringArrays),
        [["host-1"], ["host-3"]],
    );
});

test("battery discovery hides Bluetooth candidates for the OS battery path", () => {
    const candidates = [
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
    ];
    const descriptors = resolveBatteryDeviceDescriptors(candidates, enabledDiscoveryOptions());
    const diagnostics = buildBatteryDeviceDiscoveryDiagnostics(candidates, descriptors, enabledDiscoveryOptions());

    assert.deepEqual(descriptors.map(descriptor => descriptor.transport), ["usbReceiver"]);
    assert.deepEqual(diagnostics.hiddenCandidates.map(candidate => candidate.reason), ["bluetoothHandledBySystem"]);
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
            vendorUnitId: "unit-bolt",
        }),
    ], {
        ...enabledDiscoveryOptions(),
        isExperimentalVendorHidEnabled: false,
    });

    assert.deepEqual(descriptors.map(descriptor => descriptor.transport), []);
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

    assert.deepEqual(descriptors.map(descriptor => descriptor.transport), ["usbWired"]);
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

function buildIdentity(
    overrides: Partial<ResolvedSystemVendorHidPeripheralIdentity>,
): ResolvedSystemPeripheralIdentity {
    return {
        evidence: {
            kind: "vendorHid",
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
        },
    };
}

function compareNumberArrays(left: readonly number[] | undefined, right: readonly number[] | undefined): number {
    return (left?.[0] ?? 0) - (right?.[0] ?? 0);
}

function compareStringArrays(left: readonly string[] | undefined, right: readonly string[] | undefined): number {
    return (left?.[0] ?? "").localeCompare(right?.[0] ?? "");
}

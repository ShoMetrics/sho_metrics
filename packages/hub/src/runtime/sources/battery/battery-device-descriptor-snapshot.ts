import { monotonicNowMilliseconds } from "../../../shared/clock";
import { readVendorHidBatteryDeviceDescriptorSnapshot } from "../battery-hid/vendor-hid-battery-source-client";
import { readBluetoothBatteryDeviceDescriptors } from "../node-system/bluetooth-battery/bluetooth-battery";
import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
    type BatteryDeviceDiscoveryDiagnostics,
} from "./battery-device-descriptor";

// This is only a short PI de-duplication window, not a long-lived device cache.
// It catches System and Stacked panels opening close together without hiding
// real device changes across ordinary user interactions.
const PROPERTY_INSPECTOR_BATTERY_DESCRIPTOR_CACHE_TTL_MILLISECONDS = 1_000;

/** Battery picker snapshot shared by System and Stacked Property Inspectors. */
export interface BatteryDeviceDescriptorSnapshotForPropertyInspector {
    readonly availableBatteryDevices: readonly BatteryDeviceDescriptor[];
    readonly bluetoothBatteryDevices: readonly BatteryDeviceDescriptor[];
    readonly vendorBatteryDevices: readonly BatteryDeviceDescriptor[];
    readonly batteryDeviceDiscoveryDiagnostics: BatteryDeviceDiscoveryDiagnostics;
    readonly durationMilliseconds: number;
    readonly bluetoothDurationMilliseconds: number;
    readonly vendorDurationMilliseconds: number;
    readonly cacheState: "miss" | "hit" | "shared";
}

interface BatteryDeviceDescriptorSnapshotCacheEntry {
    readonly snapshot: BatteryDeviceDescriptorSnapshotForPropertyInspector;
    readonly writtenAtMonotonicMilliseconds: number;
}

interface ReadBatteryDeviceDescriptorSnapshotOptions {
    readonly isExperimentalVendorHidEnabled: boolean;
}

const cacheEntriesByKey = new Map<string, BatteryDeviceDescriptorSnapshotCacheEntry>();
const inFlightReadsByKey = new Map<string, Promise<BatteryDeviceDescriptorSnapshotForPropertyInspector>>();

/**
 * Reads the PI battery picker snapshot once for all action types.
 *
 * Opening a System PI and a Stacked PI can happen close together while they need the
 * same Bluetooth and vendor-HID descriptor list. Coalescing here avoids duplicate
 * live hardware discovery without coupling action classes to each other.
 */
export async function readBatteryDeviceDescriptorSnapshotForPropertyInspector(
    options: ReadBatteryDeviceDescriptorSnapshotOptions,
): Promise<BatteryDeviceDescriptorSnapshotForPropertyInspector> {
    const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    const cacheKey = buildCacheKey(options);
    const cacheEntry = cacheEntriesByKey.get(cacheKey);
    if (
        cacheEntry !== undefined
        && startedAtMonotonicMilliseconds - cacheEntry.writtenAtMonotonicMilliseconds
            <= PROPERTY_INSPECTOR_BATTERY_DESCRIPTOR_CACHE_TTL_MILLISECONDS
    ) {
        return withCacheState(cacheEntry.snapshot, "hit", startedAtMonotonicMilliseconds);
    }

    const inFlightRead = inFlightReadsByKey.get(cacheKey);
    if (inFlightRead !== undefined) {
        const snapshot = await inFlightRead;
        return withCacheState(snapshot, "shared", startedAtMonotonicMilliseconds);
    }

    const readPromise = readFreshBatteryDeviceDescriptorSnapshot(options);
    inFlightReadsByKey.set(cacheKey, readPromise);
    try {
        const snapshot = await readPromise;
        cacheEntriesByKey.set(cacheKey, {
            snapshot,
            writtenAtMonotonicMilliseconds: monotonicNowMilliseconds(),
        });
        return snapshot;
    } finally {
        inFlightReadsByKey.delete(cacheKey);
    }
}

async function readFreshBatteryDeviceDescriptorSnapshot(
    options: ReadBatteryDeviceDescriptorSnapshotOptions,
): Promise<BatteryDeviceDescriptorSnapshotForPropertyInspector> {
    const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    const bluetoothStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    const bluetoothBatteryDeviceDescriptorsPromise = readBluetoothBatteryDeviceDescriptors()
        .then(descriptors => ({
            descriptors,
            durationMilliseconds: monotonicNowMilliseconds() - bluetoothStartedAtMonotonicMilliseconds,
        }));
    const vendorStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    const vendorBatteryDeviceSnapshotPromise = readVendorHidBatteryDeviceDescriptorSnapshot({
        isExperimentalVendorHidEnabled: options.isExperimentalVendorHidEnabled,
    })
        .then(snapshot => ({
            snapshot,
            durationMilliseconds: monotonicNowMilliseconds() - vendorStartedAtMonotonicMilliseconds,
        }));
    const [bluetoothBatteryDeviceDescriptorResult, vendorBatteryDeviceSnapshotResult] = await Promise.all([
        bluetoothBatteryDeviceDescriptorsPromise,
        vendorBatteryDeviceSnapshotPromise,
    ]);
    const bluetoothBatteryDevices = bluetoothBatteryDeviceDescriptorResult.descriptors;
    const vendorBatteryDeviceSnapshot = vendorBatteryDeviceSnapshotResult.snapshot;
    const vendorBatteryDevices = vendorBatteryDeviceSnapshot.descriptors;

    return {
        availableBatteryDevices: [
            SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
            ...bluetoothBatteryDevices,
            ...vendorBatteryDevices,
        ],
        bluetoothBatteryDevices,
        vendorBatteryDevices,
        batteryDeviceDiscoveryDiagnostics: vendorBatteryDeviceSnapshot.diagnostics,
        durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        bluetoothDurationMilliseconds: bluetoothBatteryDeviceDescriptorResult.durationMilliseconds,
        vendorDurationMilliseconds: vendorBatteryDeviceSnapshotResult.durationMilliseconds,
        cacheState: "miss",
    };
}

function buildCacheKey(options: ReadBatteryDeviceDescriptorSnapshotOptions): string {
    return options.isExperimentalVendorHidEnabled ? "vendor-hid-enabled" : "vendor-hid-disabled";
}

function withCacheState(
    snapshot: BatteryDeviceDescriptorSnapshotForPropertyInspector,
    cacheState: BatteryDeviceDescriptorSnapshotForPropertyInspector["cacheState"],
    startedAtMonotonicMilliseconds: number,
): BatteryDeviceDescriptorSnapshotForPropertyInspector {
    return {
        ...snapshot,
        durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        cacheState,
    };
}

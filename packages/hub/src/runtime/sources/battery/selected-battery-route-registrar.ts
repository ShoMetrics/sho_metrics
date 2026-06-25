import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import {
    readSystemBluetoothPeripheralIdentity,
    readSystemVendorHidPeripheralIdentity,
} from "../../../settings/resolved-settings";
import {
    vendorHidBatteryRouteRegistry,
    type VendorHidBatteryRouteRegistry,
} from "../battery-hid/vendor-hid-battery-route-registry";
import {
    bluetoothBatteryRouteRegistry,
    type BluetoothBatteryRouteRegistry,
} from "../node-system/bluetooth-battery/route-registry";

/** Selected battery route facts pushed by visible actions into source registries. */
export interface SelectedBatteryRoute {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}

interface SelectedBatteryRouteRegistrarDependencies {
    readonly vendorHidRouteRegistry?: VendorHidBatteryRouteRegistry | undefined;
    readonly bluetoothRouteRegistry?: BluetoothBatteryRouteRegistry | undefined;
}

/**
 * Projects selected battery settings into source-owned runtime route registries.
 *
 * The source clients read snapshots by metric key only. Actions push the
 * settings-derived selected peripheral identity here so sources can perform
 * selected-device reads without depending on widget settings.
 */
export class SelectedBatteryRouteRegistrar {
    private readonly registeredVendorHidMetricKeysByOwnerId = new Map<string, ReadonlySet<string>>();
    private readonly registeredBluetoothMetricKeysByOwnerId = new Map<string, ReadonlySet<string>>();
    private readonly vendorHidRouteRegistry: VendorHidBatteryRouteRegistry;
    private readonly bluetoothRouteRegistry: BluetoothBatteryRouteRegistry;

    constructor(dependencies: SelectedBatteryRouteRegistrarDependencies = {}) {
        this.vendorHidRouteRegistry = dependencies.vendorHidRouteRegistry ?? vendorHidBatteryRouteRegistry;
        this.bluetoothRouteRegistry = dependencies.bluetoothRouteRegistry ?? bluetoothBatteryRouteRegistry;
    }

    sync(ownerId: string, routes: readonly SelectedBatteryRoute[]): void {
        const nextVendorHidMetricKeys = new Set<string>();
        const nextBluetoothMetricKeys = new Set<string>();

        for (const { metricKey, identity } of routes) {
            if (readSystemVendorHidPeripheralIdentity(identity) !== undefined) {
                nextVendorHidMetricKeys.add(metricKey);
                this.vendorHidRouteRegistry.register({ metricKey, identity, ownerId });
            }
            if (readSystemBluetoothPeripheralIdentity(identity) !== undefined) {
                nextBluetoothMetricKeys.add(metricKey);
                this.bluetoothRouteRegistry.register({ metricKey, identity, ownerId });
            }
        }

        this.unregisterMissing(
            this.registeredVendorHidMetricKeysByOwnerId.get(ownerId),
            nextVendorHidMetricKeys,
            ownerId,
            (metricKey, actionOwnerId) => this.vendorHidRouteRegistry.unregister(metricKey, actionOwnerId),
        );
        this.unregisterMissing(
            this.registeredBluetoothMetricKeysByOwnerId.get(ownerId),
            nextBluetoothMetricKeys,
            ownerId,
            (metricKey, actionOwnerId) => this.bluetoothRouteRegistry.unregister(metricKey, actionOwnerId),
        );

        updateRegisteredMetricKeys(this.registeredVendorHidMetricKeysByOwnerId, ownerId, nextVendorHidMetricKeys);
        updateRegisteredMetricKeys(this.registeredBluetoothMetricKeysByOwnerId, ownerId, nextBluetoothMetricKeys);
    }

    clear(ownerId: string): void {
        this.unregisterMissing(
            this.registeredVendorHidMetricKeysByOwnerId.get(ownerId),
            new Set<string>(),
            ownerId,
            (metricKey, actionOwnerId) => this.vendorHidRouteRegistry.unregister(metricKey, actionOwnerId),
        );
        this.unregisterMissing(
            this.registeredBluetoothMetricKeysByOwnerId.get(ownerId),
            new Set<string>(),
            ownerId,
            (metricKey, actionOwnerId) => this.bluetoothRouteRegistry.unregister(metricKey, actionOwnerId),
        );
        this.registeredVendorHidMetricKeysByOwnerId.delete(ownerId);
        this.registeredBluetoothMetricKeysByOwnerId.delete(ownerId);
    }

    private unregisterMissing(
        previousMetricKeys: ReadonlySet<string> | undefined,
        nextMetricKeys: ReadonlySet<string>,
        ownerId: string,
        unregister: (metricKey: string, ownerId: string) => void,
    ): void {
        for (const metricKey of previousMetricKeys ?? []) {
            if (!nextMetricKeys.has(metricKey)) {
                unregister(metricKey, ownerId);
            }
        }
    }
}

function updateRegisteredMetricKeys(
    registeredMetricKeysByOwnerId: Map<string, ReadonlySet<string>>,
    ownerId: string,
    metricKeys: ReadonlySet<string>,
): void {
    if (metricKeys.size === 0) {
        registeredMetricKeysByOwnerId.delete(ownerId);
    } else {
        registeredMetricKeysByOwnerId.set(ownerId, metricKeys);
    }
}

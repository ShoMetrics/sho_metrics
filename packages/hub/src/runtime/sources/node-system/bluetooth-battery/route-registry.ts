import type { ResolvedSystemPeripheralIdentity } from "../../../../settings/resolved-settings";
import { OwnedBatteryRouteRegistry } from "../../battery/owned-battery-route-registry";

/** Runtime route definition for a selected Bluetooth battery metric. */
export interface BluetoothBatteryRouteDefinition {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}

/** Adds one visible action owner for a selected Bluetooth battery route. */
export interface BluetoothBatteryRouteRegistration extends BluetoothBatteryRouteDefinition {
    readonly ownerId: string;
}

/**
 * Stores the runtime projection of user-selected Bluetooth battery routes.
 *
 * Persisted settings keep only hashed platform identity signals. The source uses
 * this registry to recover from a stale primary route with the fallback identity
 * without reading settings or widening the generic source polling contract.
 */
export class BluetoothBatteryRouteRegistry {
    private readonly routeRegistry = new OwnedBatteryRouteRegistry<BluetoothBatteryRouteDefinition>();

    register(registration: BluetoothBatteryRouteRegistration): void {
        this.routeRegistry.register({
            definition: {
                metricKey: registration.metricKey,
                identity: registration.identity,
            },
            ownerId: registration.ownerId,
        });
    }

    read(metricKey: string): BluetoothBatteryRouteDefinition | undefined {
        return this.routeRegistry.read(metricKey);
    }

    unregister(metricKey: string, ownerId: string): void {
        this.routeRegistry.unregister(metricKey, ownerId);
    }

    clear(): void {
        this.routeRegistry.clear();
    }
}

export const bluetoothBatteryRouteRegistry = new BluetoothBatteryRouteRegistry();

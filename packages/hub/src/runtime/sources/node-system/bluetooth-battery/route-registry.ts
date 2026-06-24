import type { ResolvedSystemPeripheralIdentity } from "../../../../settings/resolved-settings";

export interface BluetoothBatteryRouteDefinition {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}

export interface BluetoothBatteryRouteRegistration extends BluetoothBatteryRouteDefinition {
    readonly ownerId: string;
}

interface BluetoothBatteryRouteEntry {
    readonly definition: BluetoothBatteryRouteDefinition;
    readonly ownerIds: Set<string>;
}

/**
 * Stores the runtime projection of user-selected Bluetooth battery routes.
 *
 * Persisted settings keep only hashed platform identity signals. The source uses
 * this registry to recover from a stale primary route with the fallback identity
 * without reading settings or widening the generic source polling contract.
 */
export class BluetoothBatteryRouteRegistry {
    private readonly entriesByMetricKey = new Map<string, BluetoothBatteryRouteEntry>();

    register(registration: BluetoothBatteryRouteRegistration): void {
        const existingEntry = this.entriesByMetricKey.get(registration.metricKey);
        if (existingEntry !== undefined) {
            existingEntry.ownerIds.add(registration.ownerId);
            return;
        }

        this.entriesByMetricKey.set(registration.metricKey, {
            definition: {
                metricKey: registration.metricKey,
                identity: registration.identity,
            },
            ownerIds: new Set([registration.ownerId]),
        });
    }

    read(metricKey: string): BluetoothBatteryRouteDefinition | undefined {
        return this.entriesByMetricKey.get(metricKey)?.definition;
    }

    unregister(metricKey: string, ownerId: string): void {
        const existingEntry = this.entriesByMetricKey.get(metricKey);
        if (existingEntry === undefined) {
            return;
        }

        existingEntry.ownerIds.delete(ownerId);
        if (existingEntry.ownerIds.size === 0) {
            this.entriesByMetricKey.delete(metricKey);
        }
    }

    clear(): void {
        this.entriesByMetricKey.clear();
    }
}

export const bluetoothBatteryRouteRegistry = new BluetoothBatteryRouteRegistry();

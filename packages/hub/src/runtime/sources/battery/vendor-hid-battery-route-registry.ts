import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";

export interface VendorHidBatteryRouteDefinition {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}

export interface VendorHidBatteryRouteRegistration extends VendorHidBatteryRouteDefinition {
    readonly ownerId: string;
}

interface VendorHidBatteryRouteEntry {
    readonly definition: VendorHidBatteryRouteDefinition;
    readonly ownerIds: Set<string>;
}

/**
 * Stores the runtime projection of user-selected vendor HID battery routes.
 *
 * The persisted proto remains the write-once user intent. This registry is rebuilt from
 * resolved settings on action appearance/settings changes so the source can do a targeted
 * read without parsing metric keys or reaching back into settings.
 */
export class VendorHidBatteryRouteRegistry {
    private readonly entriesByMetricKey = new Map<string, VendorHidBatteryRouteEntry>();

    register(registration: VendorHidBatteryRouteRegistration): void {
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

    read(metricKey: string): VendorHidBatteryRouteDefinition | undefined {
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

export const vendorHidBatteryRouteRegistry = new VendorHidBatteryRouteRegistry();

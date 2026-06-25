import type { ResolvedSystemPeripheralIdentity } from "../../../settings/resolved-settings";
import { OwnedBatteryRouteRegistry } from "../battery/owned-battery-route-registry";

/** Runtime route definition for a selected vendor HID battery metric. */
export interface VendorHidBatteryRouteDefinition {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}

/** Adds one visible action owner for a selected vendor HID battery route. */
export interface VendorHidBatteryRouteRegistration extends VendorHidBatteryRouteDefinition {
    readonly ownerId: string;
}

/**
 * Stores the runtime projection of user-selected vendor HID battery routes.
 *
 * The persisted proto remains the write-once user intent. This registry is rebuilt from
 * resolved settings on action appearance/settings changes so the source can do a targeted
 * read without parsing metric keys or reaching back into settings.
 */
export class VendorHidBatteryRouteRegistry {
    private readonly routeRegistry = new OwnedBatteryRouteRegistry<VendorHidBatteryRouteDefinition>();

    register(registration: VendorHidBatteryRouteRegistration): void {
        this.routeRegistry.register({
            definition: {
                metricKey: registration.metricKey,
                identity: registration.identity,
            },
            ownerId: registration.ownerId,
        });
    }

    read(metricKey: string): VendorHidBatteryRouteDefinition | undefined {
        return this.routeRegistry.read(metricKey);
    }

    unregister(metricKey: string, ownerId: string): void {
        this.routeRegistry.unregister(metricKey, ownerId);
    }

    clear(): void {
        this.routeRegistry.clear();
    }
}

export const vendorHidBatteryRouteRegistry = new VendorHidBatteryRouteRegistry();

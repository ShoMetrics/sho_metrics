/** Minimal route shape keyed by the metric requested from a source. */
export interface OwnedBatteryRouteDefinition {
    readonly metricKey: string;
}

/** Registers one action owner for a selected battery route definition. */
export interface OwnedBatteryRouteRegistration<TDefinition extends OwnedBatteryRouteDefinition> {
    readonly definition: TDefinition;
    readonly ownerId: string;
}

interface OwnedBatteryRouteEntry<TDefinition extends OwnedBatteryRouteDefinition> {
    readonly definition: TDefinition;
    readonly ownerIds: Set<string>;
}

/**
 * Stores a selected battery route while at least one visible action owns it.
 *
 * Multiple widgets can select the same peripheral and therefore share the same
 * metric key. Owner ref-counting prevents one disappearing action from deleting
 * another action's selected-route hint.
 */
export class OwnedBatteryRouteRegistry<TDefinition extends OwnedBatteryRouteDefinition> {
    private readonly entriesByMetricKey = new Map<string, OwnedBatteryRouteEntry<TDefinition>>();

    register(registration: OwnedBatteryRouteRegistration<TDefinition>): void {
        const existingEntry = this.entriesByMetricKey.get(registration.definition.metricKey);
        if (existingEntry !== undefined) {
            existingEntry.ownerIds.add(registration.ownerId);
            return;
        }

        this.entriesByMetricKey.set(registration.definition.metricKey, {
            definition: registration.definition,
            ownerIds: new Set([registration.ownerId]),
        });
    }

    read(metricKey: string): TDefinition | undefined {
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

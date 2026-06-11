import type {
    ResolvedSingleCustomHttpRequest,
} from "../../../settings/resolved-settings";
import type { CustomHttpRuntimeIdentity } from "./custom-http-metric-key";

export interface CustomHttpMetricDefinition {
    readonly identity: CustomHttpRuntimeIdentity;
    readonly request: ResolvedSingleCustomHttpRequest;
}

export class CustomHttpDefinitionRegistry {
    private readonly definitionsByMetricKey = new Map<string, CustomHttpMetricDefinition>();

    /**
     * Adds a newly visible Custom HTTP definition and fails on duplicate keys.
     *
     * Use `replace` for deliberate settings refreshes. Keeping first registration
     * strict catches runtime identity collisions instead of letting one action or
     * slot silently shadow another.
     */
    register(definition: CustomHttpMetricDefinition): void {
        if (this.definitionsByMetricKey.has(definition.identity.metricKey)) {
            throw new Error(`Custom HTTP definition already registered: ${definition.identity.metricKey}`);
        }

        this.definitionsByMetricKey.set(definition.identity.metricKey, definition);
    }

    replace(definition: CustomHttpMetricDefinition): void {
        this.definitionsByMetricKey.set(definition.identity.metricKey, definition);
    }

    read(metricKey: string): CustomHttpMetricDefinition | undefined {
        return this.definitionsByMetricKey.get(metricKey);
    }

    unregister(metricKey: string): void {
        this.definitionsByMetricKey.delete(metricKey);
    }

    clear(): void {
        this.definitionsByMetricKey.clear();
    }

    list(): readonly CustomHttpMetricDefinition[] {
        return Array.from(this.definitionsByMetricKey.values())
            .sort((first, second) => first.identity.metricKey.localeCompare(second.identity.metricKey));
    }
}

export const customHttpDefinitionRegistry = new CustomHttpDefinitionRegistry();

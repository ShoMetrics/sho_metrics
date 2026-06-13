import {
    type CustomHttpDefinitionRegistry,
    type CustomHttpMetricDefinition,
} from "../../runtime/sources/custom-http/custom-http-definition-registry";

export type RegisteredCustomHttpMetricKeysByActionId = Map<string, ReadonlySet<string>>;

export interface CustomHttpRuntimeSourceRegistrationOptions {
    readonly customHttpDefinitionRegistry: CustomHttpDefinitionRegistry;
    readonly registeredMetricKeysByActionId: RegisteredCustomHttpMetricKeysByActionId;
    readonly actionId: string;
}

/**
 * Replaces all Custom HTTP runtime definitions owned by one Stream Deck action.
 */
export function syncCustomHttpRuntimeDefinitionsForAction(
    options: CustomHttpRuntimeSourceRegistrationOptions & {
        readonly definitions: readonly CustomHttpMetricDefinition[];
    },
): void {
    const previousMetricKeys = options.registeredMetricKeysByActionId.get(options.actionId) ?? new Set<string>();
    const nextDefinitionByMetricKey = new Map(
        options.definitions.map(definition => [definition.identity.metricKey, definition]),
    );
    const nextMetricKeys = new Set(nextDefinitionByMetricKey.keys());

    for (const metricKey of previousMetricKeys) {
        if (!nextMetricKeys.has(metricKey)) {
            options.customHttpDefinitionRegistry.unregister(metricKey);
        }
    }

    for (const definition of nextDefinitionByMetricKey.values()) {
        // Preserve registry.register as the collision detector for newly seen
        // keys; existing keys use replace because the same consumer can edit
        // URL or transform without becoming a new runtime identity owner.
        if (previousMetricKeys.has(definition.identity.metricKey)) {
            options.customHttpDefinitionRegistry.replace(definition);
        } else {
            options.customHttpDefinitionRegistry.register(definition);
        }
    }

    if (nextMetricKeys.size === 0) {
        options.registeredMetricKeysByActionId.delete(options.actionId);
    } else {
        options.registeredMetricKeysByActionId.set(options.actionId, nextMetricKeys);
    }
}

/**
 * Removes every Custom HTTP runtime definition owned by one disappearing action.
 */
export function unregisterCustomHttpRuntimeDefinitionsForAction(
    options: CustomHttpRuntimeSourceRegistrationOptions,
): void {
    const metricKeys = options.registeredMetricKeysByActionId.get(options.actionId);
    if (metricKeys === undefined) {
        return;
    }

    for (const metricKey of metricKeys) {
        options.customHttpDefinitionRegistry.unregister(metricKey);
    }
    options.registeredMetricKeysByActionId.delete(options.actionId);
}

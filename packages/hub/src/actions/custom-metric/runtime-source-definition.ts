import type { WillAppearEvent } from "@elgato/streamdeck";
import type { CustomHttpMetricDefinition } from "../../runtime/sources/custom-http/custom-http-definition-registry";
import {
    buildCustomHttpRuntimeIdentity,
    type CustomHttpRuntimeIdentity,
} from "../../runtime/sources/custom-http/custom-http-metric-key";
import type {
    ResolvedCustomMetricTarget,
    ResolvedSingleCustomHttpRequest,
} from "../../settings/resolved-settings";

export interface ResolvedCustomHttpDefinitionInput {
    readonly target: ResolvedCustomMetricTarget;
    readonly actionId: string;
    readonly consumerSlug: string;
}

/**
 * Converts one resolved Custom Metric target into the runtime source definition
 * used by the Custom HTTP source client.
 */
export function resolveCustomHttpMetricDefinition(
    input: ResolvedCustomHttpDefinitionInput,
): CustomHttpMetricDefinition | undefined {
    const request = readConfiguredSingleCustomHttpRequest(input.target);
    if (request === undefined) {
        return undefined;
    }

    return {
        identity: buildCustomHttpRuntimeIdentity({
            url: request.url,
            actionId: input.actionId,
            consumerSlug: input.consumerSlug,
        }),
        request,
    };
}

/**
 * Reads the configured single-request HTTP source from a Custom Metric target.
 */
export function readConfiguredSingleCustomHttpRequest(
    target: ResolvedCustomMetricTarget,
): ResolvedSingleCustomHttpRequest | undefined {
    if (target.configuration.state !== "configured") {
        return undefined;
    }

    const source = target.configuration.source;
    if (source.kind !== "http") {
        return undefined;
    }

    const plan = source.plan;
    return plan.kind === "singleRequest" ? plan.request : undefined;
}

/**
 * Resolves the metric key identity that a widget consumer should read.
 */
export function resolveCustomHttpRuntimeIdentity(
    event: WillAppearEvent,
    target: ResolvedCustomMetricTarget,
    consumerSlug: string,
): CustomHttpRuntimeIdentity | undefined {
    return resolveCustomHttpMetricDefinition({
        target,
        actionId: event.action.id,
        consumerSlug,
    })?.identity;
}

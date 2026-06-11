import { CUSTOM_HTTP_SOURCE_ID } from "../source-ids";

export interface CustomHttpRuntimeIdentity {
    readonly metricKey: string;
    readonly sourceScopeId: string;
    readonly sourceId: string;
    readonly hostSlug: string;
    readonly actionId: string;
    readonly consumerSlug: string;
}

export interface BuildCustomHttpRuntimeIdentityOptions {
    readonly url: string;
    readonly actionId: string;
    readonly consumerSlug: string;
}

export const CUSTOM_HTTP_METRIC_KEY_PREFIX = "custom-http:";
export const CUSTOM_HTTP_SINGLE_CONSUMER_SLUG = "single";

const MAX_HOST_SLUG_LENGTH = 32;
const FALLBACK_HOST_SLUG = "unknown-host";
const CONSUMER_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Builds the runtime-only identity for one Custom HTTP metric consumer.
 *
 * The action id is stable for a placed Stream Deck action, but one action can
 * contain multiple consumers such as Dense rows or Stacked slots. Keep the
 * consumer slug in the key so future multi-slot integrations cannot collide.
 */
export function buildCustomHttpRuntimeIdentity(
    options: BuildCustomHttpRuntimeIdentityOptions,
): CustomHttpRuntimeIdentity {
    const hostSlug = buildCustomHttpHostSlug(options.url);
    const consumerSlug = validateCustomHttpConsumerSlug(options.consumerSlug);
    const metricKey = `${CUSTOM_HTTP_METRIC_KEY_PREFIX}${hostSlug}:${options.actionId}:${consumerSlug}`;

    return {
        metricKey,
        sourceScopeId: metricKey,
        sourceId: CUSTOM_HTTP_SOURCE_ID,
        hostSlug,
        actionId: options.actionId,
        consumerSlug,
    };
}

export function buildDenseCustomHttpConsumerSlug(slotId: string): string {
    return validateCustomHttpConsumerSlug(`dense-${slotId}`);
}

export function buildStackedCustomHttpConsumerSlug(slotId: string): string {
    return validateCustomHttpConsumerSlug(`stacked-${slotId}`);
}

/**
 * Builds the URL-derived debug segment used inside Custom HTTP metric keys.
 *
 * Host slugs are intentionally not unique. The action id plus consumer slug own
 * uniqueness; this segment only keeps logs readable without storing the full
 * URL or query string in metric keys.
 */
export function buildCustomHttpHostSlug(url: string): string {
    let hostname: string;

    try {
        hostname = new URL(url).hostname;
    } catch {
        return FALLBACK_HOST_SLUG;
    }

    const sanitized = hostname
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/\./g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, MAX_HOST_SLUG_LENGTH)
        .replace(/-$/g, "");

    return sanitized.length === 0 ? FALLBACK_HOST_SLUG : sanitized;
}

function validateCustomHttpConsumerSlug(consumerSlug: string): string {
    if (!CONSUMER_SLUG_PATTERN.test(consumerSlug)) {
        throw new Error("Custom HTTP consumer slug must contain only lowercase ASCII letters, digits, or dashes.");
    }

    return consumerSlug;
}

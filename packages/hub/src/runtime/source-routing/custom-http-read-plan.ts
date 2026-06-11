import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
} from "./metric-read-plan";
import { CUSTOM_HTTP_SOURCE_ID } from "../sources/source-ids";
import type { CustomHttpRuntimeIdentity } from "../sources/custom-http/custom-http-metric-key";

/**
 * Routes Custom HTTP runtime metric keys to the Custom HTTP source client.
 *
 * The definitions themselves live in the runtime registry because the read plan
 * is intentionally just routing metadata. Keeping URL/jq details out of the
 * plan prevents MetricStore subscriptions from becoming an HTTP source config
 * cache.
 */
export function buildCustomHttpMetricReadPlan(
    identities: readonly CustomHttpRuntimeIdentity[],
): MetricReadPlan {
    return normalizeMetricReadPlan({
        metrics: identities.map(identity => ({
            sourceScopeId: identity.sourceScopeId,
            metricKey: identity.metricKey,
            sourceCandidates: [{ sourceId: CUSTOM_HTTP_SOURCE_ID }],
            failureMode: "empty",
        })),
    });
}

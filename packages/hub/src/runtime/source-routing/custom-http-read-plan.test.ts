import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_HTTP_SOURCE_ID } from "../sources/source-ids";
import {
    buildCustomHttpRuntimeIdentity,
    buildDenseCustomHttpConsumerSlug,
    buildStackedCustomHttpConsumerSlug,
} from "../sources/custom-http/custom-http-metric-key";
import { buildCustomHttpMetricReadPlan } from "./custom-http-read-plan";

test("buildCustomHttpMetricReadPlan routes runtime identities to the Custom HTTP source", () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/value",
        actionId: "action-1",
        consumerSlug: "single",
    });

    assert.deepEqual(buildCustomHttpMetricReadPlan([identity]), {
        metrics: [{
            sourceScopeId: identity.sourceScopeId,
            metricKey: identity.metricKey,
            sourceCandidates: [{ sourceId: CUSTOM_HTTP_SOURCE_ID }],
            failureMode: "empty",
        }],
    });
});

test("buildCustomHttpMetricReadPlan preserves separate Dense and Stacked consumers in one action", () => {
    const identities = [
        buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/value",
            actionId: "action-1",
            consumerSlug: buildDenseCustomHttpConsumerSlug("slot-a"),
        }),
        buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/value",
            actionId: "action-1",
            consumerSlug: buildDenseCustomHttpConsumerSlug("slot-b"),
        }),
        buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/value",
            actionId: "action-1",
            consumerSlug: buildStackedCustomHttpConsumerSlug("slot-a"),
        }),
    ];

    const readPlan = buildCustomHttpMetricReadPlan(identities);

    assert.equal(readPlan.metrics.length, 3);
    assert.equal(new Set(readPlan.metrics.map(metric => metric.metricKey)).size, 3);
});

import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildLocalMetricReadPlan,
    listMetricReadPlanKeys,
    buildMetricReadPlanKey,
    normalizeMetricReadPlan,
    selectMetricReadRouteSourceCandidates,
    type MetricReadPlan,
    type MetricReadRoute,
} from "./metric-read-plan";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

test("buildLocalMetricReadPlan prefers the Windows helper before the node system source on Windows", () => {
    const readPlan = buildLocalMetricReadPlan([
        "net.down",
        "cpu.usage_percent",
        "net.down",
    ], { platform: "win32" });

    assert.deepEqual(readPlan, {
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "net.down",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
        ],
    });
});

test("buildLocalMetricReadPlan uses only the node system source outside Windows", () => {
    const readPlan = buildLocalMetricReadPlan([
        "net.down",
        "cpu.usage_percent",
        "net.down",
    ], { platform: "darwin" });

    assert.deepEqual(readPlan, {
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "net.down",
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                failureMode: "fallback",
            },
        ],
    });
});

test("normalizeMetricReadPlan sorts unique metric entries and preserves source candidate priority", () => {
    const readPlan = normalizeMetricReadPlan({
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "gpu.temperature",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "gpu.temperature",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
        ],
    });

    assert.deepEqual(readPlan, {
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "gpu.temperature",
                sourceCandidates: [
                    { sourceId: WINDOWS_HELPER_SOURCE_ID },
                    { sourceId: NODE_SYSTEM_SOURCE_ID },
                ],
                failureMode: "fallback",
            },
        ],
    });
});

test("buildMetricReadPlanKey is stable for equivalent normalized plans", () => {
    const firstReadPlan: MetricReadPlan = {
        metrics: [
            buildPlanMetric("net.up"),
            buildPlanMetric("cpu.usage_percent"),
            buildPlanMetric("net.up"),
        ],
    };
    const secondReadPlan: MetricReadPlan = {
        metrics: [
            buildPlanMetric("cpu.usage_percent"),
            buildPlanMetric("net.up"),
        ],
    };

    assert.equal(buildMetricReadPlanKey(firstReadPlan), buildMetricReadPlanKey(secondReadPlan));
});

test("buildMetricReadPlanKey preserves source candidate priority", () => {
    const primaryWindowsPlan: MetricReadPlan = {
        metrics: [buildPlanMetric("cpu.usage_percent", {
            sourceCandidates: [
                { sourceId: WINDOWS_HELPER_SOURCE_ID },
                { sourceId: NODE_SYSTEM_SOURCE_ID },
            ],
        })],
    };
    const primaryNodePlan: MetricReadPlan = {
        metrics: [buildPlanMetric("cpu.usage_percent", {
            sourceCandidates: [
                { sourceId: NODE_SYSTEM_SOURCE_ID },
                { sourceId: WINDOWS_HELPER_SOURCE_ID },
            ],
        })],
    };

    assert.notEqual(buildMetricReadPlanKey(primaryWindowsPlan), buildMetricReadPlanKey(primaryNodePlan));
});

test("normalizeMetricReadPlan rejects conflicting routes for one metric key", () => {
    assert.throws(
        () => normalizeMetricReadPlan({
            metrics: [
                buildPlanMetric("cpu.usage_percent", {
                    sourceCandidates: [{ sourceId: WINDOWS_HELPER_SOURCE_ID }],
                }),
                buildPlanMetric("cpu.usage_percent", {
                    sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                }),
            ],
        }),
        /conflicting routes/,
    );
});

test("listMetricReadPlanKeys returns sorted normalized metric keys", () => {
    assert.deepEqual(listMetricReadPlanKeys({
        metrics: [
            buildPlanMetric("net.up"),
            buildPlanMetric("cpu.usage_percent"),
            buildPlanMetric("net.up"),
        ],
    }), ["cpu.usage_percent", "net.up"]);
});

test("selectMetricReadRouteSourceCandidates follows the route failure mode", () => {
    const sourceCandidates = [
        { sourceId: WINDOWS_HELPER_SOURCE_ID },
        { sourceId: NODE_SYSTEM_SOURCE_ID },
    ];

    assert.deepEqual(selectMetricReadRouteSourceCandidates({
        sourceScopeId: "local",
        metricKey: "cpu.usage_percent",
        sourceCandidates,
        failureMode: "fallback",
    }), sourceCandidates);
    assert.deepEqual(selectMetricReadRouteSourceCandidates({
        sourceScopeId: "local",
        metricKey: "cpu.usage_percent",
        sourceCandidates,
        failureMode: "empty",
    }), [{ sourceId: WINDOWS_HELPER_SOURCE_ID }]);
});

function buildPlanMetric(
    metricKey: string,
    overrides: Partial<MetricReadRoute> = {},
): MetricReadRoute {
    return {
        sourceScopeId: "local",
        metricKey,
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
        ...overrides,
    };
}

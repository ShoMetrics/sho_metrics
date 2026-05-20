import assert from "node:assert/strict";
import test from "node:test";
import {
    buildLocalMetricReadPlan,
    buildMetricReadPlanKey,
    normalizeMetricReadPlan,
    selectMetricReadPlanSourceCandidates,
    type MetricReadPlan,
} from "./metric-read-plan";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "./source-ids";

test("buildLocalMetricReadPlan prefers the Windows helper before the node system source on Windows", () => {
    const readPlan = buildLocalMetricReadPlan([
        "net.down",
        "cpu.usage_percent",
        "net.down",
    ], { platform: "win32" });

    assert.deepEqual(readPlan, {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "net.down"],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
    });
});

test("buildLocalMetricReadPlan uses only the node system source outside Windows", () => {
    const readPlan = buildLocalMetricReadPlan([
        "net.down",
        "cpu.usage_percent",
        "net.down",
    ], { platform: "darwin" });

    assert.deepEqual(readPlan, {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "net.down"],
        sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
        failureMode: "fallback",
    });
});

test("normalizeMetricReadPlan sorts unique metric keys and preserves source candidate priority", () => {
    const readPlan = normalizeMetricReadPlan({
        sourceScopeId: "local",
        metricKeys: [
            "gpu.temperature",
            "cpu.usage_percent",
            "gpu.temperature",
        ],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
        ],
        failureMode: "fallback",
    });

    assert.deepEqual(readPlan, {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "gpu.temperature"],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
    });
});

test("buildMetricReadPlanKey is stable for equivalent normalized plans", () => {
    const firstReadPlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["net.up", "cpu.usage_percent", "net.up"],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
    };
    const secondReadPlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "net.up"],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
    };

    assert.equal(buildMetricReadPlanKey(firstReadPlan), buildMetricReadPlanKey(secondReadPlan));
});

test("buildMetricReadPlanKey preserves source candidate priority", () => {
    const primaryWindowsPlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent"],
        sourceCandidates: [
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
            { sourceId: NODE_SYSTEM_SOURCE_ID },
        ],
        failureMode: "fallback",
    };
    const primaryNodePlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent"],
        sourceCandidates: [
            { sourceId: NODE_SYSTEM_SOURCE_ID },
            { sourceId: WINDOWS_HELPER_SOURCE_ID },
        ],
        failureMode: "fallback",
    };

    assert.notEqual(buildMetricReadPlanKey(primaryWindowsPlan), buildMetricReadPlanKey(primaryNodePlan));
});

test("selectMetricReadPlanSourceCandidates follows the read plan failure mode", () => {
    const sourceCandidates = [
        { sourceId: WINDOWS_HELPER_SOURCE_ID },
        { sourceId: NODE_SYSTEM_SOURCE_ID },
    ];

    assert.deepEqual(selectMetricReadPlanSourceCandidates({
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent"],
        sourceCandidates,
        failureMode: "fallback",
    }), sourceCandidates);
    assert.deepEqual(selectMetricReadPlanSourceCandidates({
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent"],
        sourceCandidates,
        failureMode: "empty",
    }), [{ sourceId: WINDOWS_HELPER_SOURCE_ID }]);
});

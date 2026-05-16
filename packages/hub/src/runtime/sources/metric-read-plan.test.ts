import assert from "node:assert/strict";
import test from "node:test";
import {
    buildLocalMetricReadPlan,
    buildMetricReadPlanKey,
    normalizeMetricReadPlan,
    type MetricReadPlan,
} from "./metric-read-plan";

test("buildLocalMetricReadPlan creates a normalized fallback plan for the node system source", () => {
    const readPlan = buildLocalMetricReadPlan([
        "net.down",
        "cpu.usage_percent",
        "net.down",
    ]);

    assert.deepEqual(readPlan, {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "net.down"],
        sourceCandidates: [{ sourceId: "node-system" }],
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
            { sourceId: "windows-native-helper" },
            { sourceId: "node-system" },
            { sourceId: "windows-native-helper" },
        ],
        failureMode: "fallback",
    });

    assert.deepEqual(readPlan, {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "gpu.temperature"],
        sourceCandidates: [
            { sourceId: "windows-native-helper" },
            { sourceId: "node-system" },
        ],
        failureMode: "fallback",
    });
});

test("buildMetricReadPlanKey is stable for equivalent normalized plans", () => {
    const firstReadPlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["net.up", "cpu.usage_percent", "net.up"],
        sourceCandidates: [
            { sourceId: "windows-native-helper" },
            { sourceId: "node-system" },
        ],
        failureMode: "fallback",
    };
    const secondReadPlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent", "net.up"],
        sourceCandidates: [
            { sourceId: "windows-native-helper" },
            { sourceId: "node-system" },
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
            { sourceId: "windows-native-helper" },
            { sourceId: "node-system" },
        ],
        failureMode: "fallback",
    };
    const primaryNodePlan: MetricReadPlan = {
        sourceScopeId: "local",
        metricKeys: ["cpu.usage_percent"],
        sourceCandidates: [
            { sourceId: "node-system" },
            { sourceId: "windows-native-helper" },
        ],
        failureMode: "fallback",
    };

    assert.notEqual(buildMetricReadPlanKey(primaryWindowsPlan), buildMetricReadPlanKey(primaryNodePlan));
});

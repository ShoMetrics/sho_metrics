import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedMetricSourcePolicy } from "../../settings/resolved-settings";
import {
    buildMetricReadPlanFromSourcePolicy,
} from "./metric-read-plan-builder";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
    buildUserSourceProfileSourceId,
} from "./source-ids";

test("metric read plan builder uses Windows helper then node fallback for unset local Windows settings", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy(),
        defaultSourceProfileId: undefined,
        platform: "win32",
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
        ],
    });
});

test("metric read plan builder uses only node for unset local non-Windows settings", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy(),
        defaultSourceProfileId: undefined,
        platform: "darwin",
    });

    assert.deepEqual(readPlan, {
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
                failureMode: "empty",
            },
        ],
    });
});

test("metric read plan builder honors explicit node source without fallback", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: NODE_SYSTEM_SOURCE_ID }]);
    assert.equal(readPlan.metrics[0]?.failureMode, "empty");
});

test("metric read plan builder honors explicit Windows helper source without fallback", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: WINDOWS_HELPER_SOURCE_ID }]);
    assert.equal(readPlan.metrics[0]?.failureMode, "empty");
});

test("metric read plan builder appends explicit fallback profile ids", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [
        { sourceId: WINDOWS_HELPER_SOURCE_ID },
        { sourceId: NODE_SYSTEM_SOURCE_ID },
    ]);
    assert.equal(readPlan.metrics[0]?.failureMode, "fallback");
});

test("metric read plan builder uses global default source profile before local auto", () => {
    const remoteSourceId = buildUserSourceProfileSourceId("remote-nuc");
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy(),
        defaultSourceProfileId: "remote-nuc",
        platform: "win32",
    });

    assert.deepEqual(readPlan, {
        metrics: [
            {
                sourceScopeId: remoteSourceId,
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: remoteSourceId }],
                failureMode: "empty",
            },
        ],
    });
});

test("metric read plan builder treats built-in local ids as reserved runtime profiles", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: NODE_SYSTEM_SOURCE_ID }]);
    assert.equal(readPlan.metrics[0]?.sourceScopeId, "local");
});

test("metric read plan builder keeps unknown local reserved ids out of registry source ids", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: "local:missing-helper",
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, []);
    assert.equal(readPlan.metrics[0]?.sourceScopeId, "local");
});

test("metric read plan builder can fallback after an unknown local reserved id", () => {
    const readPlan = buildMetricReadPlanFromSourcePolicy({
        metricKeys: ["cpu.usage_percent"],
        sourcePolicy: createSourcePolicy({
            primarySourceProfileId: "local:missing-helper",
            fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        }),
        defaultSourceProfileId: undefined,
        platform: "win32",
    });

    assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: NODE_SYSTEM_SOURCE_ID }]);
    assert.equal(readPlan.metrics[0]?.sourceScopeId, "local");
    assert.equal(readPlan.metrics[0]?.failureMode, "fallback");
});

function createSourcePolicy(
    overrides: Partial<ResolvedMetricSourcePolicy> = {},
): ResolvedMetricSourcePolicy {
    return {
        primarySourceProfileId: undefined,
        fallbackSourceProfileIds: [],
        failureMode: "showUnavailable",
        ...overrides,
    };
}

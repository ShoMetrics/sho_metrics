import assert from "node:assert/strict";
import test from "node:test";
import { MetricSubscriptionRegistry } from "./metric-subscription-registry";
import type { MetricReadPlan } from "../sources/metric-read-plan";

test("registerReadPlanBridge stores a normalized bridge subscription", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.registerReadPlanBridge({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["gpu.temp", "cpu.usage_percent", "gpu.temp"]),
        intervalMilliseconds: 1000,
    });

    assert.deepEqual(registry.listReadPlanBridgeSubscriptions(), [{
        subscriberId: "action-1",
        readPlan: buildReadPlan(["cpu.usage_percent", "gpu.temp"]),
        intervalMilliseconds: 1000,
    }]);
});

test("registerReadPlanBridge replaces an existing subscriber", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.registerReadPlanBridge({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["cpu.usage_percent"]),
        intervalMilliseconds: 1000,
    });
    registry.registerReadPlanBridge({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["net.down"]),
        intervalMilliseconds: 5000,
    });

    assert.deepEqual(registry.listReadPlanBridgeSubscriptions(), [{
        subscriberId: "action-1",
        readPlan: buildReadPlan(["net.down"]),
        intervalMilliseconds: 5000,
    }]);
});

test("unregister removes one subscriber without touching others", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.registerReadPlanBridge({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["cpu.usage_percent"]),
        intervalMilliseconds: 1000,
    });
    registry.registerReadPlanBridge({
        subscriberId: "action-2",
        readPlan: buildReadPlan(["gpu.temp"]),
        intervalMilliseconds: 1000,
    });

    registry.unregister("action-1");

    assert.deepEqual(registry.listReadPlanBridgeSubscriptions(), [{
        subscriberId: "action-2",
        readPlan: buildReadPlan(["gpu.temp"]),
        intervalMilliseconds: 1000,
    }]);
});

test("invalidatePlans increments the planning version without dropping subscriptions", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.registerReadPlanBridge({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["cpu.usage_percent"]),
        intervalMilliseconds: 1000,
    });

    assert.equal(registry.invalidatePlans(), 1);

    assert.deepEqual(registry.listReadPlanBridgeSubscriptions(), [{
        subscriberId: "action-1",
        readPlan: buildReadPlan(["cpu.usage_percent"]),
        intervalMilliseconds: 1000,
    }]);
});

function buildReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys,
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "fallback",
    };
}

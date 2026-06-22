import assert from "node:assert/strict";
import { test } from "vitest";
import { MetricSubscriptionRegistry, type MetricSubscription } from "./metric-subscription-registry";

test("register stores direct metric subscriptions", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.register({
        subscriberId: "action-1",
        subscriptions: [
            buildSubscription("action-1", "gpu.temp", 1000),
            buildSubscription("action-1", "cpu.usage_percent", 1000),
        ],
    });

    assert.deepEqual(registry.listSubscriptions(), [
        buildSubscription("action-1", "cpu.usage_percent", 1000),
        buildSubscription("action-1", "gpu.temp", 1000),
    ]);
});

test("register deduplicates duplicate metric subscriptions for one subscriber", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.register({
        subscriberId: "action-1",
        subscriptions: [
            buildSubscription("action-1", "gpu.temp", 1000),
            buildSubscription("action-1", "cpu.usage_percent", 1000),
            buildSubscription("action-1", "gpu.temp", 1000),
        ],
    });

    assert.deepEqual(registry.listSubscriptions(), [
        buildSubscription("action-1", "cpu.usage_percent", 1000),
        buildSubscription("action-1", "gpu.temp", 1000),
    ]);
});

test("register replaces an existing subscriber", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.register({
        subscriberId: "action-1",
        subscriptions: [buildSubscription("action-1", "cpu.usage_percent", 1000)],
    });
    registry.register({
        subscriberId: "action-1",
        subscriptions: [buildSubscription("action-1", "net.down", 5000)],
    });

    assert.deepEqual(registry.listSubscriptions(), [
        buildSubscription("action-1", "net.down", 5000),
    ]);
});

test("unregister removes one subscriber without touching others", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.register({
        subscriberId: "action-1",
        subscriptions: [buildSubscription("action-1", "cpu.usage_percent", 1000)],
    });
    registry.register({
        subscriberId: "action-2",
        subscriptions: [buildSubscription("action-2", "gpu.temp", 1000)],
    });

    registry.unregister("action-1");

    assert.deepEqual(registry.listSubscriptions(), [
        buildSubscription("action-2", "gpu.temp", 1000),
    ]);
});

test("invalidatePlans increments the planning version without dropping subscriptions", () => {
    const registry = new MetricSubscriptionRegistry();

    registry.register({
        subscriberId: "action-1",
        subscriptions: [buildSubscription("action-1", "cpu.usage_percent", 1000)],
    });

    assert.equal(registry.invalidatePlans(), 1);

    assert.deepEqual(registry.listSubscriptions(), [
        buildSubscription("action-1", "cpu.usage_percent", 1000),
    ]);
});

function buildSubscription(
    subscriberId: string,
    metricKey: string,
    intervalMilliseconds: number,
): MetricSubscription {
    return {
        subscriberId,
        metricKey,
        sourceScopeId: "local",
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "fallback",
        intervalMilliseconds,
    };
}

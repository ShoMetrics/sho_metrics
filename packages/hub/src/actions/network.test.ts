import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkMetricSubscriptionKeys } from "./network/metric-subscriptions";

test("network line view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "line",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network line view single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "line",
        networkDirection: "upload",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up"]);
});

test("network circle view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "circle",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network text view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "text",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network explicit interface subscribes to interface keys without registry lookup", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "bar",
        networkDirection: "both",
        networkInterfaceId: "Ethernet",
    });

    assert.deepEqual(subscriptionKeys, ["net.up.Ethernet", "net.down.Ethernet"]);
});

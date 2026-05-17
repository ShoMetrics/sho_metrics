import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkMetricSubscriptionKeys } from "./network/metric-subscriptions";

test("network sparkline both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        graphicType: "sparkline",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network sparkline single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        graphicType: "sparkline",
        networkDirection: "upload",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up"]);
});

test("network circular both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        graphicType: "circular",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network text both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        graphicType: "text",
        networkDirection: "both",
        networkInterfaceId: "",
    });


test("network explicit interface subscribes to interface keys without registry lookup", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        graphicType: "sparkline",
        networkDirection: "both",
        networkInterfaceId: "Ethernet",
    });

    assert.deepEqual(subscriptionKeys, ["net.up.Ethernet", "net.down.Ethernet"]);
});
    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetSpeedMetricSubscriptionKeys } from "./network/metric-subscriptions";

test("network sparkline both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "dashed-line",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network sparkline single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "dashed-line",
        networkDirection: "upload",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up"]);
});

test("network circular both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "circular",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network text both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "text",
        networkDirection: "both",
        networkInterfaceId: "",
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

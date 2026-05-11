import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetSpeedMetricSubscriptionKeys } from "./network/metric-subscriptions";

test("network sparkline both mode subscribes to upload and download", () => {
    assert.deepEqual(resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "dashed-line",
        networkDirection: "both",
        networkInterfaceId: "",
    }), ["net.up", "net.down"]);
});

test("network sparkline single mode subscribes to one direction", () => {
    assert.deepEqual(resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "dashed-line",
        networkDirection: "upload",
        networkInterfaceId: "",
    }), ["net.up"]);
});

test("network circular both mode subscribes to upload and download", () => {
    assert.deepEqual(resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "circular",
        networkDirection: "both",
        networkInterfaceId: "",
    }), ["net.up", "net.down"]);
});

test("network text both mode subscribes to upload and download", () => {
    assert.deepEqual(resolveNetSpeedMetricSubscriptionKeys({
        graphicType: "text",
        networkDirection: "both",
        networkInterfaceId: "",
    }), ["net.up", "net.down"]);
});

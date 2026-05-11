import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiskMetricSubscriptionKeys } from "./disk/metric-subscriptions";

test("disk throughput sparkline both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        graphicType: "sparkline",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput sparkline single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        graphicType: "sparkline",
        diskThroughputDirection: "read",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read"]);
});

test("disk throughput circular both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        graphicType: "circular",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput text both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        graphicType: "text",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput linear both mode falls back to total", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        graphicType: "linear",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.total"]);
});

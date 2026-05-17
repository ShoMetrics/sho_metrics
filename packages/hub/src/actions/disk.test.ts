import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveDiskMetricSubscriptionKeys,
    resolveDiskUsageMetricSubscriptionKeys,
} from "./disk/metric-subscriptions";

test("disk usage automatic volume subscribes to default usage keys", () => {
    const subscriptionKeys = resolveDiskUsageMetricSubscriptionKeys(undefined);

    assert.deepEqual(subscriptionKeys, [
        "disk.usage.used",
        "disk.usage.total",
        "disk.usage.available",
    ]);
});

test("disk usage explicit volume subscribes to volume usage keys", () => {
    const subscriptionKeys = resolveDiskUsageMetricSubscriptionKeys("E:\\");

    assert.deepEqual(subscriptionKeys, [
        "disk.volume.E%3A%5C.used",
        "disk.volume.E%3A%5C.total",
        "disk.volume.E%3A%5C.available",
    ]);
});

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

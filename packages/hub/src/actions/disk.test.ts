import assert from "node:assert/strict";
import test from "node:test";
import {
    resolveDiskMetricSubscriptionKeys,
    resolveDiskUsageMetricSubscriptionKeys,
} from "./disk/metric-subscriptions";

test("disk throughput line view both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        selectedView: "line",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput line view single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        selectedView: "line",
        diskThroughputDirection: "read",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read"]);
});

test("disk throughput circle view both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        selectedView: "circle",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput text view both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        selectedView: "text",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput bar view both mode subscribes to read and write", () => {
    const subscriptionKeys = resolveDiskMetricSubscriptionKeys({
        diskMetricKind: "throughput",
        selectedView: "bar",
        diskThroughputDirection: "both",
    });

    assert.deepEqual(subscriptionKeys, ["disk.throughput.read", "disk.throughput.write"]);
});

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

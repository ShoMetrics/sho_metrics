import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiskMetricKeys } from "./disk-metric-keys";

test("disk throughput sparkline both mode subscribes to read and write", () => {
    assert.deepEqual(resolveDiskMetricKeys({
        diskMetricKind: "throughput",
        graphicType: "dashed-line",
        diskThroughputDirection: "both",
    }), ["disk.throughput.read", "disk.throughput.write"]);
});

test("disk throughput sparkline single mode subscribes to one direction", () => {
    assert.deepEqual(resolveDiskMetricKeys({
        diskMetricKind: "throughput",
        graphicType: "dashed-line",
        diskThroughputDirection: "read",
    }), ["disk.throughput.read"]);
});

test("disk throughput non-sparkline both mode falls back to total", () => {
    assert.deepEqual(resolveDiskMetricKeys({
        diskMetricKind: "throughput",
        graphicType: "circular",
        diskThroughputDirection: "both",
    }), ["disk.throughput.total"]);
});

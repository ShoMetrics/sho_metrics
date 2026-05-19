import assert from "node:assert/strict";
import test from "node:test";
import { partitionMetricKeysByPollingGroup } from "./metric-polling-groups";

test("partition metric keys by collector polling group", () => {
    assert.deepEqual(partitionMetricKeysByPollingGroup([
        "net.up",
        "cpu.usage_percent",
        "gpu.temp",
        "net.down",
        "ram.used",
        "disk.usage.percent",
        "cpu.model",
        "custom.metric",
    ]), [
        {
            id: "cpu",
            metricKeys: ["cpu.model", "cpu.usage_percent"],
        },
        {
            id: "memory",
            metricKeys: ["ram.used"],
        },
        {
            id: "disk",
            metricKeys: ["disk.usage.percent"],
        },
        {
            id: "network",
            metricKeys: ["net.down", "net.up"],
        },
        {
            id: "gpu",
            metricKeys: ["gpu.temp"],
        },
        {
            id: "unknown",
            metricKeys: ["custom.metric"],
        },
    ]);
});

test("empty metric key list remains one all-metrics group", () => {
    assert.deepEqual(partitionMetricKeysByPollingGroup([]), [{
        id: "all",
        metricKeys: [],
    }]);
});

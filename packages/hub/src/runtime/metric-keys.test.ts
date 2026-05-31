import assert from "node:assert/strict";
import test from "node:test";
import {
    CPU_METRIC_KEYS,
    GPU_METRIC_KEYS,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    isCpuMetricKey,
    isGpuMetricKey,
    isRamMetricKey,
} from "./metric-keys";

test("metric key classifiers are backed by stable key inventories", () => {
    for (const metricKey of CPU_METRIC_KEYS) {
        assert.equal(isCpuMetricKey(metricKey), true, metricKey);
    }

    for (const metricKey of GPU_METRIC_KEYS) {
        assert.equal(isGpuMetricKey(metricKey), true, metricKey);
    }

    assert.equal(isRamMetricKey(RAM_USED_METRIC_KEY), true);
    assert.equal(isRamMetricKey(RAM_TOTAL_METRIC_KEY), true);
});

test("metric key classifiers do not accept unclassified prefixes", () => {
    assert.equal(isCpuMetricKey("cpu.future_metric"), false);
    assert.equal(isGpuMetricKey("gpu.future_metric"), false);
    assert.equal(isRamMetricKey("ram.future_metric"), false);
});

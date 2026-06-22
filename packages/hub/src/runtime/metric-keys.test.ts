import assert from "node:assert/strict";
import { test } from "vitest";
import {
    CPU_METRIC_KEYS,
    GPU_METRIC_KEYS,
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    SYSTEM_METRIC_KEYS,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    buildPeripheralBatteryPercentMetricKey,
    isBatteryMetricKey,
    isCpuMetricKey,
    isGpuMetricKey,
    isRamMetricKey,
    isSystemMetricKey,
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

    for (const metricKey of SYSTEM_METRIC_KEYS) {
        assert.equal(isSystemMetricKey(metricKey), true, metricKey);
        assert.equal(isBatteryMetricKey(metricKey), true, metricKey);
    }
});

test("metric key classifiers do not accept unclassified prefixes", () => {
    assert.equal(isCpuMetricKey("cpu.future_metric"), false);
    assert.equal(isGpuMetricKey("gpu.future_metric"), false);
    assert.equal(isRamMetricKey("ram.future_metric"), false);
    assert.equal(isSystemMetricKey("system.future_metric"), false);
    assert.equal(isBatteryMetricKey("battery.future_metric"), false);
});

test("peripheral battery metric keys are runtime-only normalized keys", () => {
    const metricKey = buildPeripheralBatteryPercentMetricKey("logitech.bolt.slot-2");

    assert.equal(metricKey, "peripheral.battery_percent:logitech.bolt.slot-2");
    assert.equal(isBatteryMetricKey(metricKey), true);
    assert.equal(isSystemMetricKey(metricKey), false);
    assert.equal(isBatteryMetricKey(SYSTEM_BATTERY_PERCENT_METRIC_KEY), true);
    assert.throws(
        () => buildPeripheralBatteryPercentMetricKey("hid path"),
        /normalized runtime id/,
    );
    assert.throws(
        () => buildPeripheralBatteryPercentMetricKey("logitech:bolt:slot-2"),
        /normalized runtime id/,
    );
});

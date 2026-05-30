import assert from "node:assert/strict";
import test from "node:test";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_METRIC_KEYS,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../metric-keys";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    getNetworkPingLatencyMetricKey,
} from "../network-metric-keys";
import {
    BUILT_IN_STABLE_METRIC_KEYS,
    hasExplicitLocalAutoMetricSourcePreference,
    isBuiltInMetricHelperOnly,
    resolveLocalAutoMetricSourceCandidates,
} from "./metric-source-preferences";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

const NODE_SYSTEM_CANDIDATES = [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
const WINDOWS_HELPER_CANDIDATES = [{ sourceId: WINDOWS_HELPER_SOURCE_ID }];
const WINDOWS_HELPER_THEN_NODE_CANDIDATES = [
    { sourceId: WINDOWS_HELPER_SOURCE_ID },
    { sourceId: NODE_SYSTEM_SOURCE_ID },
];

test("local auto source preference keeps OS aggregate metrics on node-system", () => {
    const nodeSystemMetricKeys = [
        CPU_USAGE_METRIC_KEY,
        CPU_BASE_FREQUENCY_METRIC_KEY,
        CPU_MODEL_METRIC_KEY,
        RAM_USED_METRIC_KEY,
        RAM_TOTAL_METRIC_KEY,
        getNetworkAggregateMetricKey("download"),
        getNetworkAggregateMetricKey("upload"),
        getNetworkInterfaceMetricKey("download", "Ethernet"),
        getNetworkInterfaceMetricKey("upload", "Ethernet"),
        getNetworkPingLatencyMetricKey("8.8.8.8"),
        getNetworkPingLatencyMetricKey("example.com"),
        getDefaultDiskUsageMetricKey("used"),
        getDefaultDiskUsageMetricKey("total"),
        getDefaultDiskUsageMetricKey("available"),
        getDefaultDiskUsageMetricKey("percent"),
        getDiskVolumeMetricKey("used", "C:\\"),
        getDiskVolumeMetricKey("total", "C:\\"),
        getDiskVolumeMetricKey("available", "C:\\"),
        getDiskVolumeMetricKey("percent", "C:\\"),
    ];

    for (const metricKey of nodeSystemMetricKeys) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "win32"),
            NODE_SYSTEM_CANDIDATES,
            metricKey,
        );
    }
});

test("local auto source preference routes ping keys to node-system on all supported platforms", () => {
    const pingMetricKey = getNetworkPingLatencyMetricKey("8.8.8.8");

    assert.equal(hasExplicitLocalAutoMetricSourcePreference(pingMetricKey), true);
    assert.deepEqual(resolveLocalAutoMetricSourceCandidates(pingMetricKey, "win32"), NODE_SYSTEM_CANDIDATES);
    assert.deepEqual(resolveLocalAutoMetricSourceCandidates(pingMetricKey, "darwin"), NODE_SYSTEM_CANDIDATES);
    assert.deepEqual(resolveLocalAutoMetricSourceCandidates(pingMetricKey, "linux"), NODE_SYSTEM_CANDIDATES);
});

test("local auto source preference uses only Windows helper for helper-owned stable metrics", () => {
    const helperOnlyMetricKeys = [
        CPU_TEMP_METRIC_KEY,
        CPU_POWER_METRIC_KEY,
    ];

    for (const metricKey of helperOnlyMetricKeys) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "win32"),
            WINDOWS_HELPER_CANDIDATES,
            metricKey,
        );
    }
});

test("helper-only metric classification is a static built-in routing fact", () => {
    assert.equal(isBuiltInMetricHelperOnly(CPU_TEMP_METRIC_KEY), true);
    assert.equal(isBuiltInMetricHelperOnly(CPU_POWER_METRIC_KEY), true);
    assert.equal(isBuiltInMetricHelperOnly(GPU_METRIC_KEYS[0]), false);
    assert.equal(isBuiltInMetricHelperOnly(CPU_USAGE_METRIC_KEY), false);
});

test("local auto source preference routes Windows disk throughput to helper", () => {
    for (const direction of ["read", "write"] as const) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(getDiskThroughputMetricKey(direction), "win32"),
            WINDOWS_HELPER_CANDIDATES,
            direction,
        );
    }
});

test("local auto source preference uses Windows helper before node-system for stable GPU metrics", () => {
    for (const metricKey of GPU_METRIC_KEYS) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "win32"),
            WINDOWS_HELPER_THEN_NODE_CANDIDATES,
            metricKey,
        );
    }
});

test("local auto source preference uses node-system outside Windows", () => {
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(GPU_METRIC_KEYS[0], "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(getDiskThroughputMetricKey("read"), "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );
});

test("local auto source preference defaults unknown metric keys to node-system", () => {
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates("custom.unclassified", "win32"),
        NODE_SYSTEM_CANDIDATES,
    );
});

test("local auto source preference covers every known stable built-in metric key", () => {
    assert.deepEqual(new Set(BUILT_IN_STABLE_METRIC_KEYS).size, BUILT_IN_STABLE_METRIC_KEYS.length);

    for (const metricKey of BUILT_IN_STABLE_METRIC_KEYS) {
        assert.equal(
            hasExplicitLocalAutoMetricSourcePreference(metricKey),
            true,
            metricKey,
        );
    }
});


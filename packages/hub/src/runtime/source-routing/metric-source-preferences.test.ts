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
    CPU_USAGE_METRIC_KEY,
    GPU_METRIC_KEYS,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../metric-keys";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
} from "../network-metric-keys";
import {
    BUILT_IN_STABLE_METRIC_KEYS,
    hasExplicitLocalAutoMetricSourcePreference,
    resolveLocalAutoMetricSourceCandidates,
} from "./metric-source-preferences";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

const NODE_SYSTEM_CANDIDATES = [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
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
        getDefaultDiskUsageMetricKey("used"),
        getDefaultDiskUsageMetricKey("total"),
        getDefaultDiskUsageMetricKey("available"),
        getDefaultDiskUsageMetricKey("percent"),
        getDiskVolumeMetricKey("used", "C:\\"),
        getDiskVolumeMetricKey("total", "C:\\"),
        getDiskVolumeMetricKey("available", "C:\\"),
        getDiskVolumeMetricKey("percent", "C:\\"),
        getDiskThroughputMetricKey("read"),
        getDiskThroughputMetricKey("write"),
        getDiskThroughputMetricKey("total"),
    ];

    for (const metricKey of nodeSystemMetricKeys) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "win32"),
            NODE_SYSTEM_CANDIDATES,
            metricKey,
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

import assert from "node:assert/strict";
import { test } from "vitest";
import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
} from "../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_METRIC_KEYS,
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_METRIC_KEYS,
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    buildBluetoothBatteryPercentMetricKey,
    buildVendorHidBatteryPercentMetricKey,
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
    isBuiltInMetricSupportedOnPlatform,
    isBuiltInMetricHelperOnly,
    localSourceSupportsMetricOnPlatform,
    resolveLocalAutoMetricSourceCandidates,
} from "./metric-source-preferences";
import {
    NODE_SYSTEM_SOURCE_ID,
    VENDOR_HID_BATTERY_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

const NODE_SYSTEM_CANDIDATES = [{ sourceId: NODE_SYSTEM_SOURCE_ID }];
const WINDOWS_HELPER_CANDIDATES = [{ sourceId: WINDOWS_HELPER_SOURCE_ID }];
const WINDOWS_HELPER_THEN_NODE_CANDIDATES = [
    { sourceId: WINDOWS_HELPER_SOURCE_ID },
    { sourceId: NODE_SYSTEM_SOURCE_ID },
];
const VENDOR_HID_BATTERY_CANDIDATES = [{ sourceId: VENDOR_HID_BATTERY_SOURCE_ID }];

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

test("local auto source preference routes battery metrics to battery sources", () => {
    const vendorHidBatteryMetricKey = buildVendorHidBatteryPercentMetricKey("logitech.bolt.slot-2");
    const bluetoothBatteryMetricKey = buildBluetoothBatteryPercentMetricKey("device-aabbccddeeff");

    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(SYSTEM_BATTERY_PERCENT_METRIC_KEY, "win32"),
        NODE_SYSTEM_CANDIDATES,
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(SYSTEM_BATTERY_PERCENT_METRIC_KEY, "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(SYSTEM_BATTERY_PERCENT_METRIC_KEY, "linux"),
        [],
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(vendorHidBatteryMetricKey, "win32"),
        VENDOR_HID_BATTERY_CANDIDATES,
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(vendorHidBatteryMetricKey, "darwin"),
        [],
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(bluetoothBatteryMetricKey, "win32"),
        NODE_SYSTEM_CANDIDATES,
    );
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(bluetoothBatteryMetricKey, "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );
    assert.equal(hasExplicitLocalAutoMetricSourcePreference(SYSTEM_BATTERY_PERCENT_METRIC_KEY), true);
    assert.equal(hasExplicitLocalAutoMetricSourcePreference(vendorHidBatteryMetricKey), true);
    assert.equal(hasExplicitLocalAutoMetricSourcePreference(bluetoothBatteryMetricKey), true);
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

test("local auto source preference hides helper-only metrics outside Windows", () => {
    for (const metricKey of [CPU_TEMP_METRIC_KEY, CPU_POWER_METRIC_KEY]) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "darwin"),
            [],
            metricKey,
        );
        assert.equal(isBuiltInMetricSupportedOnPlatform(metricKey, "darwin"), false, metricKey);
    }
});

test("helper-only metric classification is a static built-in routing fact", () => {
    assert.equal(isBuiltInMetricHelperOnly(CPU_TEMP_METRIC_KEY), true);
    assert.equal(isBuiltInMetricHelperOnly(CPU_POWER_METRIC_KEY), true);
    assert.equal(isBuiltInMetricHelperOnly(getDiskThroughputMetricKey("read")), false);
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

test("local auto source preference keeps only node-supported GPU metrics outside Windows", () => {
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(GPU_USAGE_METRIC_KEY, "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );

    for (const metricKey of [
        GPU_MODEL_METRIC_KEY,
        GPU_TEMP_METRIC_KEY,
        GPU_VRAM_USED_METRIC_KEY,
        GPU_VRAM_TOTAL_METRIC_KEY,
        GPU_POWER_METRIC_KEY,
        GPU_POWER_LIMIT_METRIC_KEY,
    ]) {
        assert.deepEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "darwin"),
            [],
            metricKey,
        );
        assert.equal(isBuiltInMetricSupportedOnPlatform(metricKey, "darwin"), false, metricKey);
    }
});

test("local auto source preference uses node-system for supported non-Windows disk throughput", () => {
    assert.deepEqual(
        resolveLocalAutoMetricSourceCandidates(getDiskThroughputMetricKey("read"), "darwin"),
        NODE_SYSTEM_CANDIDATES,
    );
});

test("local auto source candidates always satisfy source platform support", () => {
    for (const metricKey of BUILT_IN_STABLE_METRIC_KEYS) {
        for (const platform of ["win32", "darwin"] as const) {
            for (const sourceCandidate of resolveLocalAutoMetricSourceCandidates(metricKey, platform)) {
                assert.equal(
                    localSourceSupportsMetricOnPlatform(sourceCandidate.sourceId, metricKey, platform),
                    true,
                    `${metricKey} routed to ${sourceCandidate.sourceId} on ${platform}`,
                );
            }
        }
    }
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

test("local auto source preference covers stable metric key inventories", () => {
    const builtInStableMetricKeySet = new Set<string>(BUILT_IN_STABLE_METRIC_KEYS);

    for (const metricKey of [
        ...CPU_METRIC_KEYS,
        ...GPU_METRIC_KEYS,
        RAM_USED_METRIC_KEY,
        RAM_TOTAL_METRIC_KEY,
        SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    ]) {
        assert.equal(
            builtInStableMetricKeySet.has(metricKey),
            true,
            `${metricKey} must be classified in local:auto source routing`,
        );
    }
});

test("local auto source preference gives every stable built-in metric a Windows source", () => {
    for (const metricKey of BUILT_IN_STABLE_METRIC_KEYS) {
        assert.notEqual(
            resolveLocalAutoMetricSourceCandidates(metricKey, "win32").length,
            0,
            `${metricKey} must not disappear from Windows local:auto routing`,
        );
    }
});

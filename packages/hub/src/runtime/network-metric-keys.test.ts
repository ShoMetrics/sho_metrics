import assert from "node:assert/strict";
import test from "node:test";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    resolveNetworkMetricKey,
} from "./network-metric-keys";

test("resolveNetworkMetricKey empty interface id returns aggregate key", () => {
    assert.equal(
        resolveNetworkMetricKey("download", undefined),
        getNetworkAggregateMetricKey("download"),
    );
    assert.equal(
        resolveNetworkMetricKey("upload", ""),
        getNetworkAggregateMetricKey("upload"),
    );
});

test("resolveNetworkMetricKey explicit interface id returns interface key", () => {
    assert.equal(
        resolveNetworkMetricKey("download", "Ethernet"),
        getNetworkInterfaceMetricKey("download", "Ethernet"),
    );
});

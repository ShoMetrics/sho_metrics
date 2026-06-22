import assert from "node:assert/strict";
import { test } from "vitest";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    getNetworkPingLatencyMetricKey,
    isNetworkMetricKey,
    isNetworkPingLatencyMetricKey,
    readNetworkPingLatencyMetricTargetHost,
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

test("network ping metric keys encode and decode target hosts", () => {
    assert.equal(getNetworkPingLatencyMetricKey("8.8.8.8"), "net.ping.latency.8.8.8.8");
    assert.equal(getNetworkPingLatencyMetricKey("example.com"), "net.ping.latency.example.com");
    assert.equal(
        getNetworkPingLatencyMetricKey("2606:4700:4700::1111"),
        "net.ping.latency.2606%3A4700%3A4700%3A%3A1111",
    );

    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping.latency.8.8.8.8"), "8.8.8.8");
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping.latency.example.com"), "example.com");
    assert.equal(
        readNetworkPingLatencyMetricTargetHost("net.ping.latency.2606%3A4700%3A4700%3A%3A1111"),
        "2606:4700:4700::1111",
    );
});

test("network ping metric key parser rejects non-ping and malformed keys", () => {
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.down"), undefined);
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping."), undefined);
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping.8.8.8.8"), undefined);
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping.latency."), undefined);
    assert.equal(readNetworkPingLatencyMetricTargetHost("net.ping.latency.%E0%A4%A"), undefined);
});

test("network metric key predicate includes ping keys", () => {
    assert.equal(isNetworkPingLatencyMetricKey(getNetworkPingLatencyMetricKey("8.8.8.8")), true);
    assert.equal(isNetworkMetricKey(getNetworkPingLatencyMetricKey("8.8.8.8")), true);
});


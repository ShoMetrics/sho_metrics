import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkMetricSubscriptionKeys } from "./network/metric-subscriptions";
import { getNetworkPingLatencyMetricKey } from "../runtime/network-metric-keys";

test("network line view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "line",
        reading: {
            kind: "traffic",
            direction: "both",
            interfaceId: "",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network line view single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "line",
        reading: {
            kind: "traffic",
            direction: "upload",
            interfaceId: "",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.up"]);
});

test("network circle view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "circle",
        reading: {
            kind: "traffic",
            direction: "both",
            interfaceId: "",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network text view both mode subscribes to upload and download", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "text",
        reading: {
            kind: "traffic",
            direction: "both",
            interfaceId: "",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.up", "net.down"]);
});

test("network explicit interface subscribes to interface keys without registry lookup", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "bar",
        reading: {
            kind: "traffic",
            direction: "both",
            interfaceId: "Ethernet",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.up.Ethernet", "net.down.Ethernet"]);
});

test("network bar view single mode subscribes to one direction", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "bar",
        reading: {
            kind: "traffic",
            direction: "download",
            interfaceId: "",
            trafficDisplayMode: "mirrored",
            display: buildNetworkDisplaySettings(),
        },
    });

    assert.deepEqual(subscriptionKeys, ["net.down"]);
});

test("network ping mode subscribes to the ping target key", () => {
    const subscriptionKeys = resolveNetworkMetricSubscriptionKeys({
        selectedView: "line",
        reading: {
            kind: "ping",
            targetHost: "8.8.8.8",
        },
    });

    assert.deepEqual(subscriptionKeys, [getNetworkPingLatencyMetricKey("8.8.8.8")]);
});

function buildNetworkDisplaySettings() {
    return {
        scaleMode: "auto",
        maximumDownloadSpeedMegabitsPerSecond: undefined,
        maximumUploadSpeedMegabitsPerSecond: undefined,
        unitBase: "byte",
    } as const;
}


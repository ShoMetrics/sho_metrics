import assert from "node:assert/strict";
import { test } from "vitest";
import {
    getNetworkPingLatencyMetricKey,
} from "../../network-metric-keys";
import { MetricUnit, type MetricValue } from "../metric-source";
import {
    pollNetworkPingMetrics,
    resolveRequestedNetworkPingMetricKeys,
} from "./node-system-network-ping";
import type { NodeSystemInformationClient } from "./node-system-source-types";

test("network ping helper returns no requested keys for empty input", () => {
    assert.deepEqual(resolveRequestedNetworkPingMetricKeys([]), []);
});

test("network ping helper canonicalizes and deduplicates requested target hosts", () => {
    assert.deepEqual(
        resolveRequestedNetworkPingMetricKeys([
            getNetworkPingLatencyMetricKey("Example.COM"),
            getNetworkPingLatencyMetricKey("example.com"),
            getNetworkPingLatencyMetricKey("bad host"),
            "net.down",
        ]),
        [getNetworkPingLatencyMetricKey("example.com")],
    );
});

test("network ping polling returns no metrics and does not call inetLatency for empty input", async () => {
    const inetLatencyCalls: string[] = [];

    const metrics = await pollNetworkPingMetrics({
        metricKeys: [],
        systemInformation: buildFakePingSystemInformation(inetLatencyCalls, {
            "8.8.8.8": 23,
        }),
    });

    assert.deepEqual(metrics, {});
    assert.deepEqual(inetLatencyCalls, []);
});

test("network ping polling emits finite millisecond latency values", async () => {
    const inetLatencyCalls: string[] = [];
    const metricKey = getNetworkPingLatencyMetricKey("8.8.8.8");

    const metrics = await pollNetworkPingMetrics({
        metricKeys: [metricKey],
        systemInformation: buildFakePingSystemInformation(inetLatencyCalls, {
            "8.8.8.8": 23.4,
        }),
    });

    assert.deepEqual(inetLatencyCalls, ["8.8.8.8"]);
    assert.deepEqual(readScalarMetric(metrics, metricKey), {
        scalar: 23.4,
        unit: MetricUnit.MILLISECONDS,
    });
});

test("network ping polling omits null and invalid latency values", async () => {
    const inetLatencyCalls: string[] = [];
    const nullKey = getNetworkPingLatencyMetricKey("null.example");
    const nanKey = getNetworkPingLatencyMetricKey("nan.example");
    const infiniteKey = getNetworkPingLatencyMetricKey("infinite.example");
    const negativeKey = getNetworkPingLatencyMetricKey("negative.example");

    const metrics = await pollNetworkPingMetrics({
        metricKeys: [nullKey, nanKey, infiniteKey, negativeKey],
        systemInformation: buildFakePingSystemInformation(inetLatencyCalls, {
            "null.example": null,
            "nan.example": Number.NaN,
            "infinite.example": Number.POSITIVE_INFINITY,
            "negative.example": -1,
        }),
    });

    assert.deepEqual(metrics, {});
    assert.deepEqual(inetLatencyCalls, [
        "null.example",
        "nan.example",
        "infinite.example",
        "negative.example",
    ]);
});

test("network ping polling catches inetLatency exceptions per target", async () => {
    const inetLatencyCalls: string[] = [];
    const failingKey = getNetworkPingLatencyMetricKey("fail.example");
    const workingKey = getNetworkPingLatencyMetricKey("ok.example");

    const metrics = await pollNetworkPingMetrics({
        metricKeys: [failingKey, workingKey],
        systemInformation: {
            inetLatency: (async (host?: string) => {
                if (host) {
                    inetLatencyCalls.push(host);
                }
                if (host === "fail.example") {
                    throw new Error("ping failed");
                }

                return 12;
            }) as NodeSystemInformationClient["inetLatency"],
        },
    });

    assert.deepEqual(inetLatencyCalls, ["fail.example", "ok.example"]);
    assert.equal(metrics[failingKey], undefined);
    assert.deepEqual(readScalarMetric(metrics, workingKey), {
        scalar: 12,
        unit: MetricUnit.MILLISECONDS,
    });
});

function buildFakePingSystemInformation(
    calls: string[],
    valuesByHost: Readonly<Record<string, number | null>>,
): Pick<NodeSystemInformationClient, "inetLatency"> {
    return {
        inetLatency: (async (host?: string) => {
            if (host) {
                calls.push(host);
            }

            return valuesByHost[host ?? ""] ?? null;
        }) as NodeSystemInformationClient["inetLatency"],
    };
}

function readScalarMetric(
    metrics: Record<string, MetricValue>,
    metricKey: string,
): { readonly scalar: number; readonly unit: MetricUnit | undefined } | undefined {
    const metricValue = metrics[metricKey];
    if (!metricValue || metricValue.value.case !== "scalar") {
        return undefined;
    }

    return {
        scalar: metricValue.value.value,
        unit: metricValue.unit,
    };
}


import assert from "node:assert/strict";
import test from "node:test";
import { createMetricSourceClient } from "./source-client";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    MetricUnit,
    type MetricSnapshot,
    type MetricSource,
} from "./metric-source";
import type { SourceMetricPollingGroupResolution } from "./source-polling-groups";

test("metric source client uses pollMetrics when the source supports requested keys", async () => {
    const source = new FakeMetricSource();
    const sourceClient = createMetricSourceClient(source);

    const snapshot = await sourceClient.readSnapshot(["cpu.usage_percent"]);

    assert.equal(snapshot, source.snapshot);
    assert.deepEqual(source.polledMetricKeyListList, [["cpu.usage_percent"]]);
});

test("metric source client falls back to poll for poll-only sources", async () => {
    const source = new PollOnlyMetricSource();
    const sourceClient = createMetricSourceClient(source);

    const snapshot = await sourceClient.readSnapshot(["cpu.usage_percent"]);

    assert.equal(snapshot, source.snapshot);
    assert.equal(source.pollCount, 1);
});

test("metric source client forwards source-declared polling groups", () => {
    const source = new ResolvingMetricSource();
    const sourceClient = createMetricSourceClient(source);

    const resolutions = sourceClient.resolveMetricPollingGroups?.(["cpu.usage_percent"]);

    assert.deepEqual(resolutions?.get("cpu.usage_percent"), {
        state: "owned",
        pollingGroupId: "fake-source:cpu",
    });
});

class FakeMetricSource implements MetricSource {
    readonly sourceId = "fake-source";
    readonly snapshot: MetricSnapshot = buildTestSnapshot();
    readonly polledMetricKeyListList: string[][] = [];

    async poll(): Promise<MetricSnapshot> {
        return this.snapshot;
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<MetricSnapshot> {
        this.polledMetricKeyListList.push([...metricKeys]);
        return this.snapshot;
    }
}

class ResolvingMetricSource extends FakeMetricSource {
    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [
            metricKey,
            { state: "owned", pollingGroupId: `${this.sourceId}:cpu` },
        ]));
    }
}

class PollOnlyMetricSource implements MetricSource {
    readonly sourceId = "poll-only-source";
    readonly snapshot: MetricSnapshot = buildTestSnapshot();
    pollCount = 0;

    async poll(): Promise<MetricSnapshot> {
        this.pollCount += 1;
        return this.snapshot;
    }
}

function buildTestSnapshot(): MetricSnapshot {
    return buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(42, { unit: MetricUnit.PERCENT }),
        },
    });
}

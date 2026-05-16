import assert from "node:assert/strict";
import test from "node:test";
import { createMetricSourceClient } from "./source-client";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type IMetricSnapshot,
    type IMetricSource,
} from "./source.interface";

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

class FakeMetricSource implements IMetricSource {
    readonly sourceId = "fake-source";
    readonly snapshot: IMetricSnapshot = buildTestSnapshot(this.sourceId);
    readonly polledMetricKeyListList: string[][] = [];

    async poll(): Promise<IMetricSnapshot> {
        return this.snapshot;
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        this.polledMetricKeyListList.push([...metricKeys]);
        return this.snapshot;
    }
}

class PollOnlyMetricSource implements IMetricSource {
    readonly sourceId = "poll-only-source";
    readonly snapshot: IMetricSnapshot = buildTestSnapshot(this.sourceId);
    pollCount = 0;

    async poll(): Promise<IMetricSnapshot> {
        this.pollCount += 1;
        return this.snapshot;
    }
}

function buildTestSnapshot(sourceId: string): IMetricSnapshot {
    return buildMetricSnapshot({
        sourceId,
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(42, { unit: "%" }),
        },
    });
}

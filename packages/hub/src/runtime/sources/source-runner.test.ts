import assert from "node:assert/strict";
import test from "node:test";
import { DefaultSourceRunner } from "./source-runner";
import { DefaultSourceRegistry } from "./source-registry";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    buildTextMetricValue,
    type IMetricSnapshot,
    type IMetricValue,
} from "./source.interface";
import type { SourceClient } from "./source-client";
import type { MetricReadPlan } from "./metric-read-plan";

test("source runner keeps primary values when all requested metrics are present", async () => {
    const primarySource = new FakeSourceClient("primary", {
        "cpu.usage_percent": buildScalarMetricValue(42),
    });
    const fallbackSource = new FakeSourceClient("fallback", {
        "cpu.usage_percent": buildScalarMetricValue(84),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll(buildReadPlan(["cpu.usage_percent"]));

    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 42);
    assert.deepEqual(primarySource.requestedMetricKeyListList, [["cpu.usage_percent"]]);
    assert.deepEqual(fallbackSource.requestedMetricKeyListList, []);
});

test("source runner fills missing primary metrics from fallback sources", async () => {
    const primarySource = new FakeSourceClient("primary", {
        "cpu.usage_percent": buildScalarMetricValue(42),
    });
    const fallbackSource = new FakeSourceClient("fallback", {
        "gpu.temp": buildScalarMetricValue(62),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll(buildReadPlan(["cpu.usage_percent", "gpu.temp"]));

    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 42);
    assert.equal(readScalarMetricValue(snapshot, "gpu.temp"), 62);
    assert.deepEqual(primarySource.requestedMetricKeyListList, [["cpu.usage_percent", "gpu.temp"]]);
    assert.deepEqual(fallbackSource.requestedMetricKeyListList, [["gpu.temp"]]);
});

test("source runner falls back after source errors", async () => {
    const primarySource = new FailingSourceClient("primary");
    const fallbackSource = new FakeSourceClient("fallback", {
        "cpu.usage_percent": buildScalarMetricValue(84),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll(buildReadPlan(["cpu.usage_percent"]));

    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 84);
    assert.deepEqual(fallbackSource.requestedMetricKeyListList, [["cpu.usage_percent"]]);
});

test("source runner omits invalid metric values before fallback", async () => {
    const primarySource = new FakeSourceClient("primary", {
        "cpu.usage_percent": buildScalarMetricValue(Number.NaN),
        "cpu.model": buildTextMetricValue(""),
    });
    const fallbackSource = new FakeSourceClient("fallback", {
        "cpu.usage_percent": buildScalarMetricValue(21),
        "cpu.model": buildTextMetricValue("fallback cpu"),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll(buildReadPlan(["cpu.usage_percent", "cpu.model"]));

    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 21);
    assert.equal(readTextMetricValue(snapshot, "cpu.model"), "fallback cpu");
});

test("source runner does not try fallback candidates in empty failure mode", async () => {
    const primarySource = new FakeSourceClient("primary", {});
    const fallbackSource = new FakeSourceClient("fallback", {
        "cpu.usage_percent": buildScalarMetricValue(84),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll({
        ...buildReadPlan(["cpu.usage_percent"]),
        failureMode: "empty",
    });

    assert.deepEqual(Object.keys(snapshot.metrics), []);
    assert.deepEqual(fallbackSource.requestedMetricKeyListList, []);
});

test("source runner returns source-scoped snapshots for all-metric reads", async () => {
    const primarySource = new FakeSourceClient("primary", {
        "cpu.usage_percent": buildScalarMetricValue(42),
    });
    const sourceRunner = createSourceRunner(primarySource);

    const snapshot = await sourceRunner.poll(buildReadPlan([]));

    assert.equal(snapshot.sourceId, "local");
    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 42);
    assert.deepEqual(primarySource.requestedMetricKeyListList, [[]]);
});

test("source runner returns source-scoped snapshots after all-metric fallback", async () => {
    const primarySource = new FailingSourceClient("primary");
    const fallbackSource = new FakeSourceClient("fallback", {
        "cpu.usage_percent": buildScalarMetricValue(84),
    });
    const sourceRunner = createSourceRunner(primarySource, fallbackSource);

    const snapshot = await sourceRunner.poll(buildReadPlan([]));

    assert.equal(snapshot.sourceId, "local");
    assert.equal(readScalarMetricValue(snapshot, "cpu.usage_percent"), 84);
    assert.deepEqual(fallbackSource.requestedMetricKeyListList, [[]]);
});

function createSourceRunner(...sourceClients: readonly SourceClient[]): DefaultSourceRunner {
    return new DefaultSourceRunner(new DefaultSourceRegistry(sourceClients));
}

function buildReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys,
        sourceCandidates: [
            { sourceId: "primary" },
            { sourceId: "fallback" },
        ],
        failureMode: "fallback",
    };
}

class FakeSourceClient implements SourceClient {
    readonly requestedMetricKeyListList: string[][] = [];

    constructor(
        readonly sourceId: string,
        private readonly metrics: Record<string, IMetricValue>,
    ) {}

    async readSnapshot(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        this.requestedMetricKeyListList.push([...metricKeys]);

        return buildMetricSnapshot({
            sourceId: this.sourceId,
            timestampMilliseconds: 1000,
            metrics: this.metrics,
        });
    }
}

class FailingSourceClient implements SourceClient {
    constructor(readonly sourceId: string) {}

    async readSnapshot(): Promise<IMetricSnapshot> {
        throw new Error(`Source failed: ${this.sourceId}`);
    }
}

function readScalarMetricValue(snapshot: IMetricSnapshot, metricKey: string): number | undefined {
    const metricValue = snapshot.metrics[metricKey];
    return metricValue?.data.case === "scalar" ? metricValue.data.value : undefined;
}

function readTextMetricValue(snapshot: IMetricSnapshot, metricKey: string): string | undefined {
    const metricValue = snapshot.metrics[metricKey];
    return metricValue?.data.case === "text" ? metricValue.data.value : undefined;
}

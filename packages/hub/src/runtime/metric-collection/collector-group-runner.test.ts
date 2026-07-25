import assert from "node:assert/strict";
import { test } from "vitest";
import { CollectorGroupRunner } from "./collector-group-runner";
import { BATTERY_RECOVERY_RETRY_OFFSETS_MILLISECONDS } from "../sources/source-polling-groups";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import type { CollectorGroupNoDataObserver } from "./collector-group-no-data-observer";
import {
    MetricStoreIngestDiagnostics,
    type MetricStoreFirstScalarDiagnosticSamplesLogEntry,
} from "./metric-store-ingest-diagnostics";
import { MetricStore } from "../metric-store";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type MetricSnapshot,
} from "../sources/metric-source";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { SourceSnapshotReadResult } from "../sources/source-client";

const ASYNC_TIMER_DRAIN_MICROTASK_TICKS = 10;

test("refreshNow reads the source client and writes scoped samples to MetricStore", async () => {
    const metricStore = new MetricStore();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient,
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed", hasAllRequestedMetrics: true });

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        42,
    );
    assert.equal(
        metricStore.forScope("local").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("refreshNow skips overlapping refreshes", async () => {
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([deferredSnapshot.promise]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const firstRefreshPromise = runner.refreshNow();

    assert.deepEqual(await runner.refreshNow(), { status: "skippedPending" });

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));

    assert.deepEqual(await firstRefreshPromise, { status: "refreshed", hasAllRequestedMetrics: true });
    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
});

test("refreshNow records failure backoff and skips attempts during cooldown", async () => {
    let currentTimestampMilliseconds = 0;
    const sourceClient = new FakeSourceClient([
        Promise.reject(new Error("source failed")),
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const metricStore = new MetricStore();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient,
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => currentTimestampMilliseconds, 1000),
    });

    const failureResult = await runner.refreshNow();
    assert.equal(failureResult.status, "failed");
    assert.equal(failureResult.backoffDelayMilliseconds, 1000);

    assert.deepEqual(await runner.refreshNow(), { status: "skippedBackoff" });

    currentTimestampMilliseconds = 1000;

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed", hasAllRequestedMetrics: true });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        55,
    );
});

test("requestOnDemandRefresh reads immediately and writes scoped samples to MetricStore", async () => {
    const metricStore = new MetricStore();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient,
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    assert.deepEqual(await runner.requestOnDemandRefresh(), { status: "refreshed", hasAllRequestedMetrics: true });

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        42,
    );
});

test("requestOnDemandRefresh clears a later scheduled poll before reading", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();

    assert.equal(fakeTimer.activeHandleCount(), 1);

    assert.deepEqual(await runner.requestOnDemandRefresh(), { status: "refreshed", hasAllRequestedMetrics: true });

    assert.equal(fakeTimer.activeHandleCount(), 1);
    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 1000]);
});

test("requestOnDemandRefresh schedules the next poll from trigger completion", async () => {
    const fakeTimer = new FakeTimer();
    const triggeredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        triggeredSnapshot.promise,
        buildSnapshot(3000, { "cpu.usage_percent": 77 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();
    const onDemandRefreshPromise = runner.requestOnDemandRefresh();

    await fakeTimer.advanceBy(100_000);

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);

    triggeredSnapshot.resolve(buildSnapshot(2000, { "cpu.usage_percent": 55 }));
    assert.deepEqual(await onDemandRefreshPromise, { status: "refreshed", hasAllRequestedMetrics: true });

    await fakeTimer.advanceBy(999);

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);

    await fakeTimer.advanceBy(1);

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);
});

test("requestOnDemandRefresh skips without reading while another refresh is pending", async () => {
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([deferredSnapshot.promise]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const firstRefreshPromise = runner.refreshNow();

    assert.deepEqual(await runner.requestOnDemandRefresh(), { status: "skippedPending" });

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));

    assert.deepEqual(await firstRefreshPromise, { status: "refreshed", hasAllRequestedMetrics: true });
    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
});

test("requestOnDemandRefresh respects backoff without clearing the scheduled poll", async () => {
    let currentTimestampMilliseconds = 0;
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient([
        Promise.reject(new Error("source failed")),
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => currentTimestampMilliseconds, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();

    assert.equal(fakeTimer.activeHandleCount(), 1);
    assert.deepEqual(await runner.requestOnDemandRefresh(), { status: "skippedBackoff" });
    assert.equal(fakeTimer.activeHandleCount(), 1);

    currentTimestampMilliseconds = 1000;
    await fakeTimer.advanceBy(1000);

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);
});

test("refreshNow reports collector group no-data when refreshed snapshot has no requested keys", async () => {
    const noDataObserver = new RecordingCollectorGroupNoDataObserver();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent", "cpu.model"] }),
        sourceClient: new FakeSourceClient([
            buildSnapshot(1000, { "ram.used": 42 }),
        ]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        collectorGroupNoDataObserver: noDataObserver,
    });

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed", hasAllRequestedMetrics: false });

    assert.deepEqual(noDataObserver.observations.map(observation => observation.state), ["noData"]);
});

test("refreshNow reports collector group ok when refreshed snapshot has a requested key", async () => {
    const noDataObserver = new RecordingCollectorGroupNoDataObserver();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent", "cpu.model"] }),
        sourceClient: new FakeSourceClient([
            buildSnapshot(1000, { "cpu.model": 1 }),
        ]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        collectorGroupNoDataObserver: noDataObserver,
    });

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed", hasAllRequestedMetrics: false });

    assert.deepEqual(noDataObserver.observations.map(observation => observation.state), ["ok"]);
});

test("refreshNow reports invalid values dropped by MetricStore ingest", async () => {
    const diagnosticsLogWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([
            buildSnapshot(1000, { "cpu.usage_percent": Number.NaN }),
        ]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        metricStoreIngestDiagnostics: new MetricStoreIngestDiagnostics({
            logWriter: diagnosticsLogWriter,
            throttleMilliseconds: 60_000,
        }),
    });

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed", hasAllRequestedMetrics: true });

    assert.deepEqual(diagnosticsLogWriter.entries.map(entry => ({
        sourceId: entry.sourceId,
        sourceScopeId: entry.sourceScopeId,
        groupKind: entry.groupKind,
        groupId: entry.groupId,
        rejectedCount: entry.rejectedCount,
        uniqueMetricCount: entry.uniqueMetricCount,
        intervalMilliseconds: entry.intervalMilliseconds,
    })), [{
        sourceId: "node-system",
        sourceScopeId: "local",
        groupKind: "sourceDeclared",
        groupId: "cpu",
        rejectedCount: 1,
        uniqueMetricCount: 1,
        intervalMilliseconds: 1000,
    }]);
});

test("refreshNow does not report collector group no-data for failed or skipped refreshes", async () => {
    const noDataObserver = new RecordingCollectorGroupNoDataObserver();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([
            Promise.reject(new Error("source failed")),
        ]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        collectorGroupNoDataObserver: noDataObserver,
    });

    const failureResult = await runner.refreshNow();
    assert.equal(failureResult.status, "failed");

    assert.deepEqual(await runner.refreshNow(), { status: "skippedBackoff" });
    assert.deepEqual(noDataObserver.observations, []);
});

test("stop clears collector group no-data state", () => {
    const noDataObserver = new RecordingCollectorGroupNoDataObserver();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        collectorGroupNoDataObserver: noDataObserver,
    });

    runner.stop();

    assert.deepEqual(noDataObserver.clearedCollectorGroupKeys, [
        JSON.stringify(["local", "node-system", "sourceDeclared", "cpu"]),
    ]);
});

test("stop prevents an in-flight refresh from writing stale generation results", async () => {
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([deferredSnapshot.promise]),
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const refreshPromise = runner.refreshNow();
    runner.stop();
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));

    assert.deepEqual(await refreshPromise, { status: "stopped" });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("updateCollectorGroup refreshes immediately when the metric set changes", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 40 }),
        buildSnapshot(2000, { "cpu.model": 1 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();

    runner.updateCollectorGroup(buildCollectorGroup({
        metricKeys: ["cpu.model"],
        intervalMilliseconds: 5000,
    }));

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.model"],
    ]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 0, 5000]);
});

test("updateCollectorGroup prevents an in-flight old generation from writing", async () => {
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([deferredSnapshot.promise]),
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const refreshPromise = runner.refreshNow();
    runner.updateCollectorGroup(buildCollectorGroup({ metricKeys: ["cpu.model"] }));
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));

    assert.deepEqual(await refreshPromise, { status: "skippedSuperseded" });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("updateCollectorGroup keeps in-flight refresh alive when refresh inputs are unchanged", async () => {
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient: new FakeSourceClient([deferredSnapshot.promise]),
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const refreshPromise = runner.refreshNow();
    runner.updateCollectorGroup(buildCollectorGroup({
        metricKeys: ["cpu.usage_percent"],
        intervalMilliseconds: 1000,
    }));
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));

    assert.deepEqual(await refreshPromise, { status: "refreshed", hasAllRequestedMetrics: true });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        42,
    );
});

test("updateCollectorGroup queues an immediate refresh after a pending old generation", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([
        deferredSnapshot.promise,
        buildSnapshot(2000, { "cpu.model": 1 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();
    runner.updateCollectorGroup(buildCollectorGroup({
        metricKeys: ["cpu.model"],
        intervalMilliseconds: 5000,
    }));
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));
    await fakeTimer.drainMicrotasks();

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.model"],
    ]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 0, 5000]);
});

test("requestOnDemandRefresh keeps the settings-change trailing refresh while pending", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([
        deferredSnapshot.promise,
        buildSnapshot(2000, { "cpu.model": 1 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();
    runner.updateCollectorGroup(buildCollectorGroup({
        metricKeys: ["cpu.model"],
        intervalMilliseconds: 5000,
    }));

    assert.deepEqual(await runner.requestOnDemandRefresh(), { status: "skippedPending" });

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));
    await fakeTimer.drainMicrotasks();
    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.model"],
    ]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 0, 5000]);
});

test("requestOnDemandRefresh prevents an in-flight old generation from writing", async () => {
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([deferredSnapshot.promise]),
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
    });

    const refreshPromise = runner.requestOnDemandRefresh();
    runner.updateCollectorGroup(buildCollectorGroup({ metricKeys: ["cpu.model"] }));
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));

    assert.deepEqual(await refreshPromise, { status: "skippedSuperseded" });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("start does not create a second timer while a running refresh is pending", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([deferredSnapshot.promise]),
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.runNext();
    runner.start();

    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0]);

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));
    await fakeTimer.drainMicrotasks();

    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000]);
});

test("periodic refresh waits for pending refresh before scheduling the next poll", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient([
        deferredSnapshot.promise,
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    runner.start();
    await fakeTimer.advanceBy(0);
    await fakeTimer.advanceBy(100_000);

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0]);

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));
    await fakeTimer.drainMicrotasks();

    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000]);

    await fakeTimer.advanceBy(1000);

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);
});

test("periodic refresh continues when refresh result callback throws", async () => {
    const fakeTimer = new FakeTimer();
    let callbackCallCount = 0;
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
        onRefreshResult: () => {
            callbackCallCount += 1;
            if (callbackCallCount === 1) {
                throw new Error("callback failed");
            }
        },
    });

    runner.start();
    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000]);

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.usage_percent"],
    ]);
});

test("stop then start keeps old in-flight results out and schedules a new tick", async () => {
    const fakeTimer = new FakeTimer();
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
        sourceClient: new FakeSourceClient([
            deferredSnapshot.promise,
            buildSnapshot(2000, { "cpu.usage_percent": 55 }),
        ]),
        snapshotStore: metricStore,
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    const oldRefreshPromise = runner.refreshNow();
    runner.stop();
    runner.start();
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 99 }));

    assert.deepEqual(await oldRefreshPromise, { status: "skippedSuperseded" });

    await fakeTimer.runNext();

    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        55,
    );
});

const RECOVERY_TEST_INTERVAL_MILLISECONDS = 600_000;

test("recovery schedule retries at absolute offsets from start and settles without rearming", async () => {
    const recovery = createRecoveryRunner({
        respond: () => ({}),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);
    for (let attempt = 0; attempt < 7; attempt += 1) {
        await recovery.fakeTimer.runNext();
    }

    // Attempts land on trigger-relative offsets, not on completion-relative
    // delays (which would drift to 10/40/100/190/310s). After exhaustion the
    // cadence returns to the plain interval and further no-data refreshes do
    // not re-arm the schedule.
    assert.deepEqual(recovery.readTimesMilliseconds, [
        0,
        10_000,
        30_000,
        60_000,
        90_000,
        120_000,
        120_000 + RECOVERY_TEST_INTERVAL_MILLISECONDS,
        120_000 + 2 * RECOVERY_TEST_INTERVAL_MILLISECONDS,
    ]);
});

test("recovery schedule keeps offsets absolute when a read is slow", async () => {
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    let readCount = 0;
    const recovery = createRecoveryRunner({
        respondAsync: () => {
            readCount += 1;
            return readCount === 2 ? deferredSnapshot.promise : Promise.resolve(buildSnapshot(1000, {}));
        },
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);
    await recovery.fakeTimer.runNext();

    // The 10s attempt spends 5s reading; the next attempt still lands at the
    // absolute 30s offset instead of 5s late.
    await recovery.fakeTimer.advanceBy(5_000);
    deferredSnapshot.resolve(buildSnapshot(1000, {}));
    await recovery.fakeTimer.drainMicrotasks();
    await recovery.fakeTimer.runNext();

    assert.deepEqual(recovery.readTimesMilliseconds, [0, 10_000, 30_000]);
});

test("recovery schedule keeps retrying while only some requested metrics produce", async () => {
    // The node-system battery polling group carries the system battery and
    // every Bluetooth battery together. The laptop battery answering right
    // away must not end the recovery burst while the Bluetooth mouse is still
    // reconnecting; only full coverage ends it.
    let readCount = 0;
    const recovery = createRecoveryRunner({
        metricKeys: ["system.battery_percent", "bluetooth.battery_percent:mouse"],
        respond: (): Readonly<Record<string, number>> => {
            readCount += 1;
            return readCount <= 2
                ? { "system.battery_percent": 90 }
                : { "system.battery_percent": 90, "bluetooth.battery_percent:mouse": 60 };
        },
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);
    await recovery.fakeTimer.runNext();
    await recovery.fakeTimer.runNext();
    await recovery.fakeTimer.runNext();

    assert.deepEqual(recovery.readTimesMilliseconds, [
        0,
        10_000,
        30_000,
        30_000 + RECOVERY_TEST_INTERVAL_MILLISECONDS,
    ]);
});

test("runner without a recovery schedule keeps the plain interval on no-data", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, {}),
        buildSnapshot(2000, {}),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
        monotonicNow: () => fakeTimer.nowMilliseconds(),
    });

    runner.start();
    await fakeTimer.advanceBy(0);
    await fakeTimer.runNext();

    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 1000]);
});

test("requestRecoveryRefresh replaces an earlier scheduled poll instead of keeping it", async () => {
    // scheduleNextRefresh keeps an existing earlier timer. A pre-sleep overdue
    // poll is exactly that earlier timer, and keeping it would fire a read the
    // moment the process resumes: the read this schedule exists to delay.
    const recovery = createRecoveryRunner({
        respond: (readCount): Readonly<Record<string, number>> => (readCount === 1 ? { "bluetooth.battery_percent:mouse": 80 } : {}),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);

    await recovery.fakeTimer.advanceBy(599_000);
    void recovery.runner.requestRecoveryRefresh();

    assert.equal(recovery.fakeTimer.activeHandleCount(), 1);

    await recovery.fakeTimer.advanceBy(1_000);
    assert.deepEqual(recovery.readTimesMilliseconds, [0]);

    await recovery.fakeTimer.advanceBy(9_000);
    assert.deepEqual(recovery.readTimesMilliseconds, [0, 609_000]);
});

test("requestRecoveryRefresh reads immediately when no recovery schedule is configured", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient([
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        buildSnapshot(2000, { "cpu.usage_percent": 55 }),
    ]);
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
        sourceClient,
        snapshotStore: new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
        monotonicNow: () => fakeTimer.nowMilliseconds(),
    });

    runner.start();
    await fakeTimer.advanceBy(0);

    const recoveryResult = await runner.requestRecoveryRefresh();

    assert.equal(recoveryResult?.status, "refreshed");
    assert.equal(sourceClient.requestedMetricKeys.length, 2);
});

test("rapid recovery requests coalesce into one timer and one delayed read", async () => {
    const recovery = createRecoveryRunner({
        respond: () => ({}),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);

    await recovery.fakeTimer.advanceBy(1_000);
    void recovery.runner.requestRecoveryRefresh();
    void recovery.runner.requestRecoveryRefresh();
    void recovery.runner.requestRecoveryRefresh();
    await recovery.fakeTimer.advanceBy(500);
    void recovery.runner.requestRecoveryRefresh();
    void recovery.runner.requestRecoveryRefresh();

    assert.equal(recovery.fakeTimer.activeHandleCount(), 1);

    await recovery.fakeTimer.advanceBy(10_000);

    // A burst of resume events produces zero extra reads: the first attempt
    // simply lands at the last request plus the first offset.
    assert.deepEqual(recovery.readTimesMilliseconds, [0, 11_500]);
});

test("requestRecoveryRefresh during a pending read neither reads nor double-schedules", async () => {
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    let readCount = 0;
    const recovery = createRecoveryRunner({
        respondAsync: () => {
            readCount += 1;
            return readCount === 1 ? deferredSnapshot.promise : Promise.resolve(buildSnapshot(1000, {}));
        },
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);

    await recovery.fakeTimer.advanceBy(5_000);
    void recovery.runner.requestRecoveryRefresh();

    assert.equal(recovery.fakeTimer.activeHandleCount(), 1);
    assert.deepEqual(recovery.readTimesMilliseconds, [0]);

    deferredSnapshot.resolve(buildSnapshot(1000, {}));
    await recovery.fakeTimer.drainMicrotasks();

    // The pending read started before the recovery trigger, so its completion
    // resolves superseded and cannot touch the already scheduled attempt.
    assert.equal(recovery.fakeTimer.activeHandleCount(), 1);

    await recovery.fakeTimer.advanceBy(10_000);
    assert.deepEqual(recovery.readTimesMilliseconds, [0, 15_000]);
});

test("a pre-recovery read returning full coverage cannot unload the new schedule", async () => {
    // Race: a read starts before sleep, the machine resumes and arms the
    // recovery schedule, then the old read resolves with full pre-sleep
    // coverage. That result describes the pre-sleep world: it must neither
    // unload the schedule nor write into the post-resume store.
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const metricStore = new MetricStore();
    const recovery = createRecoveryRunner({
        snapshotStore: metricStore,
        respondAsync: readCount => {
            if (readCount === 1) {
                return Promise.resolve(buildSnapshot(1000, { "bluetooth.battery_percent:mouse": 60 }));
            }
            if (readCount === 2) {
                return deferredSnapshot.promise;
            }
            if (readCount === 3) {
                return Promise.resolve(buildSnapshot(3000, {}));
            }
            return Promise.resolve(buildSnapshot(4000, { "bluetooth.battery_percent:mouse": 61 }));
        },
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);
    await recovery.fakeTimer.runNext();

    await recovery.fakeTimer.advanceBy(20_000);
    void recovery.runner.requestRecoveryRefresh();

    deferredSnapshot.resolve(buildSnapshot(2000, { "bluetooth.battery_percent:mouse": 77 }));
    await recovery.fakeTimer.drainMicrotasks();

    assert.equal(
        metricStore.forScope("node-system")
            .getWidgetData("bluetooth.battery_percent:mouse", "Mouse", "%").current,
        60,
    );

    // The +10s attempt comes back incomplete; the schedule must still be
    // armed, so the next attempt lands on the +30s offset instead of a full
    // slow interval away.
    await recovery.fakeTimer.runNext();
    await recovery.fakeTimer.runNext();

    assert.deepEqual(recovery.readTimesMilliseconds, [
        0,
        RECOVERY_TEST_INTERVAL_MILLISECONDS,
        620_000 + 10_000,
        620_000 + 30_000,
    ]);
});

test("a pre-recovery read that rejects cannot arm backoff for the new schedule", async () => {
    // The mirror of the stale-success race: a read started before sleep is the
    // one most likely to reject on resume (dropped pipe, absent device). Its
    // rejection describes the pre-sleep world, so it must not be recorded as a
    // failure of the new epoch, where the resulting cooldown could swallow the
    // first recovery attempt.
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const recovery = createRecoveryRunner({
        // Long enough that a cooldown armed by the stale rejection would still
        // be blocking when the first recovery attempt is due.
        backoffDelayMilliseconds: 30_000,
        respondAsync: readCount => (readCount === 1
            ? deferredSnapshot.promise
            : Promise.resolve(buildSnapshot(2000, { "bluetooth.battery_percent:mouse": 60 }))),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);

    await recovery.fakeTimer.advanceBy(5_000);
    void recovery.runner.requestRecoveryRefresh();

    deferredSnapshot.reject(new Error("pipe closed while suspended"));
    await recovery.fakeTimer.drainMicrotasks();

    // The first recovery attempt must actually read at +10s rather than being
    // skipped by a cooldown the stale rejection had no right to arm.
    await recovery.fakeTimer.advanceBy(10_000);

    assert.deepEqual(recovery.readTimesMilliseconds, [0, 15_000]);
});

test("a later recovery request resets the schedule to the new trigger", async () => {
    const recovery = createRecoveryRunner({
        respond: () => ({}),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);
    await recovery.fakeTimer.runNext();

    await recovery.fakeTimer.advanceBy(10_000);
    void recovery.runner.requestRecoveryRefresh();
    await recovery.fakeTimer.runNext();
    await recovery.fakeTimer.runNext();

    // Reads at 30s and 50s follow the new trigger at 20s; the old trigger
    // would have placed the second read at 60s.
    assert.deepEqual(recovery.readTimesMilliseconds, [0, 10_000, 30_000, 50_000]);
});

test("stop clears the recovery schedule and its timer", async () => {
    const recovery = createRecoveryRunner({
        respond: () => ({}),
    });

    recovery.runner.start();
    await recovery.fakeTimer.advanceBy(0);

    recovery.runner.stop();

    assert.equal(recovery.fakeTimer.activeHandleCount(), 0);

    void recovery.runner.requestRecoveryRefresh();

    assert.equal(recovery.fakeTimer.activeHandleCount(), 0);
});

function createRecoveryRunner(options: {
    readonly metricKeys?: readonly string[];
    readonly respond?: (readCount: number) => Readonly<Record<string, number>>;
    readonly respondAsync?: (readCount: number) => Promise<MetricSnapshot>;
    readonly snapshotStore?: MetricStore;
    readonly backoffDelayMilliseconds?: number;
}): {
    readonly runner: CollectorGroupRunner;
    readonly fakeTimer: FakeTimer;
    readonly readTimesMilliseconds: number[];
} {
    const fakeTimer = new FakeTimer();
    const readTimesMilliseconds: number[] = [];
    let readCount = 0;
    const sourceClient = {
        async readSnapshot(): Promise<SourceSnapshotReadResult> {
            readCount += 1;
            readTimesMilliseconds.push(fakeTimer.nowMilliseconds());
            const snapshot = options.respondAsync
                ? await options.respondAsync(readCount)
                : buildSnapshot(1000, options.respond?.(readCount) ?? {});

            return {
                snapshot,
                valueMetadata: [],
                unavailableMetrics: [],
            };
        },
    };
    const runner = new CollectorGroupRunner({
        collectorGroup: buildCollectorGroup({
            metricKeys: options.metricKeys ?? ["bluetooth.battery_percent:mouse"],
            intervalMilliseconds: RECOVERY_TEST_INTERVAL_MILLISECONDS,
            recoveryRetryOffsetsMilliseconds: BATTERY_RECOVERY_RETRY_OFFSETS_MILLISECONDS,
        }),
        sourceClient,
        snapshotStore: options.snapshotStore ?? new MetricStore(),
        backoffPolicy: BackoffPolicy.flat(
            () => fakeTimer.nowMilliseconds(),
            options.backoffDelayMilliseconds ?? 1000,
        ),
        timer: fakeTimer,
        monotonicNow: () => fakeTimer.nowMilliseconds(),
    });

    return { runner, fakeTimer, readTimesMilliseconds };
}

class FakeSourceClient {
    readonly requestedMetricKeys: string[][] = [];
    private responseIndex = 0;

    constructor(private readonly responses: readonly (MetricSnapshot | Promise<MetricSnapshot>)[]) {}

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        this.requestedMetricKeys.push([...metricKeys]);
        const response = this.responses[this.responseIndex];
        this.responseIndex += 1;

        if (!response) {
            throw new Error("No fake source response queued.");
        }

        return {
            snapshot: await response,
            valueMetadata: [],
            unavailableMetrics: [],
        };
    }
}

class RecordingCollectorGroupNoDataObserver implements CollectorGroupNoDataObserver {
    readonly observations: Array<{
        readonly collectorGroupKey: string;
        readonly state: "ok" | "noData";
    }> = [];
    readonly clearedCollectorGroupKeys: string[] = [];

    observe(collectorGroup: PlannedCollectorGroup, state: "ok" | "noData"): void {
        this.observations.push({
            collectorGroupKey: collectorGroup.collectorGroupKey,
            state,
        });
    }

    clear(collectorGroupKey: string): void {
        this.clearedCollectorGroupKeys.push(collectorGroupKey);
    }
}

class RecordingMetricStoreIngestDiagnosticsLogWriter {
    readonly entries: Array<{
        readonly sourceId: string;
        readonly sourceScopeId: string | undefined;
        readonly groupKind: string | undefined;
        readonly groupId: string | undefined;
        readonly rejectedCount: number;
        readonly uniqueMetricCount: number;
        readonly intervalMilliseconds: number | undefined;
    }> = [];

    writeFirstScalarDiagnosticSamples(entry: MetricStoreFirstScalarDiagnosticSamplesLogEntry): void {
        void entry;
    }

    write(entry: RecordingMetricStoreIngestDiagnosticsLogWriter["entries"][number]): void {
        this.entries.push(entry);
    }
}

interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T): void;
    reject(error: Error): void;
}

function createDeferred<T>(): Deferred<T> {
    let resolveDeferred: ((value: T) => void) | null = null;
    let rejectDeferred: ((error: Error) => void) | null = null;
    const promise = new Promise<T>((resolve, reject) => {
        resolveDeferred = resolve;
        rejectDeferred = reject;
    });

    return {
        promise,
        resolve(value: T): void {
            if (!resolveDeferred) {
                throw new Error("Deferred promise was not initialized.");
            }

            resolveDeferred(value);
        },
        reject(error: Error): void {
            if (!rejectDeferred) {
                throw new Error("Deferred promise was not initialized.");
            }

            rejectDeferred(error);
        },
    };
}

class FakeTimer {
    readonly recordedDelaysMilliseconds: number[] = [];
    private readonly handles: FakeTimerHandle[] = [];
    private currentMilliseconds = 0;

    set(callback: () => void, delayMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
            dueAtMilliseconds: this.currentMilliseconds + delayMilliseconds,
        };
        this.handles.push(handle);
        this.recordedDelaysMilliseconds.push(delayMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as FakeTimerHandle).active = false;
    }

    async runNext(): Promise<void> {
        const handle = this.shiftNextActiveHandle();

        if (!handle) {
            return;
        }

        this.currentMilliseconds = Math.max(this.currentMilliseconds, handle.dueAtMilliseconds);
        handle.active = false;
        handle.callback();
        await this.drainMicrotasks();
    }

    async advanceBy(delayMilliseconds: number): Promise<void> {
        const targetMilliseconds = this.currentMilliseconds + delayMilliseconds;

        while (true) {
            const handle = this.shiftNextActiveHandleBeforeOrAt(targetMilliseconds);
            if (!handle) {
                this.currentMilliseconds = targetMilliseconds;
                return;
            }

            this.currentMilliseconds = handle.dueAtMilliseconds;
            handle.active = false;
            handle.callback();
            await this.drainMicrotasks();
        }
    }

    async drainMicrotasks(): Promise<void> {
        for (let tick = 0; tick < ASYNC_TIMER_DRAIN_MICROTASK_TICKS; tick += 1) {
            await Promise.resolve();
        }
    }

    nowMilliseconds(): number {
        return this.currentMilliseconds;
    }

    activeHandleCount(): number {
        return this.handles.filter(handle => handle.active).length;
    }

    private shiftNextActiveHandle(): FakeTimerHandle | undefined {
        return this.shiftNextActiveHandleByPredicate(() => true);
    }

    private shiftNextActiveHandleBeforeOrAt(targetMilliseconds: number): FakeTimerHandle | undefined {
        return this.shiftNextActiveHandleByPredicate(handle => handle.dueAtMilliseconds <= targetMilliseconds);
    }

    private shiftNextActiveHandleByPredicate(
        predicate: (handle: FakeTimerHandle) => boolean,
    ): FakeTimerHandle | undefined {
        const sortedHandles = this.handles
            .map((handle, index) => ({ handle, index }))
            .filter(entry => entry.handle.active && predicate(entry.handle))
            .sort((left, right) => left.handle.dueAtMilliseconds - right.handle.dueAtMilliseconds);
        const nextHandleEntry = sortedHandles[0];

        if (!nextHandleEntry) {
            return undefined;
        }

        this.handles.splice(nextHandleEntry.index, 1);
        return nextHandleEntry.handle;
    }
}

interface FakeTimerHandle {
    active: boolean;
    dueAtMilliseconds: number;
    callback(): void;
}

function buildCollectorGroup(options: {
    readonly metricKeys: readonly string[];
    readonly intervalMilliseconds?: number;
    readonly recoveryRetryOffsetsMilliseconds?: readonly number[];
}): PlannedCollectorGroup {
    return {
        collectorGroupKey: JSON.stringify(["local", "node-system", "sourceDeclared", "cpu"]),
        sourceScopeId: "local",
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        pollingGroupId: "cpu",
        metricKeys: options.metricKeys,
        intervalMilliseconds: options.intervalMilliseconds ?? 1000,
        subscriberIds: ["action-1"],
        ...(options.recoveryRetryOffsetsMilliseconds === undefined
            ? {}
            : { recoveryRetryOffsetsMilliseconds: options.recoveryRetryOffsetsMilliseconds }),
    };
}

function buildSnapshot(
    timestampMilliseconds: number,
    scalarMetrics: Readonly<Record<string, number>>,
): MetricSnapshot {
    return buildMetricSnapshot({
        timestampMilliseconds,
        metrics: Object.fromEntries(
            Object.entries(scalarMetrics)
                .map(([metricKey, value]) => [metricKey, buildScalarMetricValue(value)]),
        ),
    });
}

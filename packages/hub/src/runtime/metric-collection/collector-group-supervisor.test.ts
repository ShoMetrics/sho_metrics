import assert from "node:assert/strict";
import { test } from "vitest";
import {
    classifyRefreshDemandPollingGroupForLog,
    CollectorGroupSupervisor,
} from "./collector-group-supervisor";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import { MetricStore } from "../metric-store";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type MetricSnapshot,
} from "../sources/metric-source";
import {
    SourceRefreshDemandError,
    type SourceClient,
    type SourceRefreshDemandGroup,
    type SourceSnapshotReadResult,
} from "../sources/source-client";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import { WINDOWS_HELPER_SOURCE_ID } from "../sources/source-ids";

// The runner callback chains through timer -> refreshNow -> readSnapshot ->
// ingest -> finally. Ten turns leaves margin for small async instrumentation.
const ASYNC_TIMER_DRAIN_MICROTASK_TICKS = 10;

test("refresh demand log classification uses real LHM polling group shapes", () => {
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/intelcpu/0"), "cpu");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/amdcpu/0"), "cpu");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/gpu-nvidia/0"), "gpu");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/gpu-intel-integrated/pci-0"), "gpu");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/GPU-NVIDIA/0"), "gpu");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/ram"), "ram");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/nvme/0"), "storage");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/hdd/0"), "storage");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/nic/{adapter-id}"), "network");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/mainboard"), "motherboard");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:hardware:/lpc/nct6701d/0"), "motherboard");
    assert.equal(classifyRefreshDemandPollingGroupForLog("windows-native:aggregate:disk"), "disk");
    assert.equal(classifyRefreshDemandPollingGroupForLog("lhm:aggregate:network"), "network");
    assert.equal(classifyRefreshDemandPollingGroupForLog("unknown:shape"), "other");
});

test("reconcile starts a runner for a new collector group", async () => {
    const fakeTimer = new FakeTimer();
    const metricStore = new MetricStore();
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        42,
    );
});

test("reconcile updates an existing runner with the same collector group key", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 40 }),
        buildSnapshot(2000, { "cpu.model": 1 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            metricKeys: ["cpu.usage_percent"],
            intervalMilliseconds: 1000,
        }),
    ]);
    await fakeTimer.runNext();

    supervisor.reconcile([
        buildCollectorGroup({
            metricKeys: ["cpu.model"],
            intervalMilliseconds: 5000,
        }),
    ]);
    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["cpu.model"],
    ]);
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 0, 5000]);
});

test("reconcile stops runners whose collector groups disappear", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);
    supervisor.reconcile([]);

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, []);
});

test("reconcile skips collector groups whose source client is missing", async () => {
    const fakeTimer = new FakeTimer();
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);

    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, []);
});

test("reconcile retries missing sources on the next plan pass", async () => {
    const fakeTimer = new FakeTimer();
    const sourceRegistry = new FakeSourceRegistry([]);
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry,
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });
    const collectorGroup = buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] });

    supervisor.reconcile([collectorGroup]);
    sourceRegistry.register(sourceClient);
    supervisor.reconcile([collectorGroup]);
    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
});

test("requestSubscriberRefresh returns missingSubscriber when no live runner matches", async () => {
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "missingSubscriber",
    });
});

test("requestSubscriberRefresh refreshes the matching runner", async () => {
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "refreshed",
    });
    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
});

test("requestSubscriberRefresh refreshes every runner that backs the subscriber", async () => {
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        buildSnapshot(1000, { "gpu.usage_percent": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    supervisor.reconcile([
        buildCollectorGroup({
            pollingGroupId: "cpu",
            metricKeys: ["cpu.usage_percent"],
        }),
        buildCollectorGroup({
            pollingGroupId: "gpu",
            metricKeys: ["gpu.usage_percent"],
        }),
    ]);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "refreshed",
    });
    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["gpu.usage_percent"],
    ]);
});

test("requestSubscriberRefresh ignores runners for other subscribers", async () => {
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    supervisor.reconcile([
        buildCollectorGroup({
            pollingGroupId: "cpu",
            metricKeys: ["cpu.usage_percent"],
            subscriberIds: ["action-1"],
        }),
        buildCollectorGroup({
            pollingGroupId: "gpu",
            metricKeys: ["gpu.usage_percent"],
            subscriberIds: ["action-2"],
        }),
    ]);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "refreshed",
    });
    assert.deepEqual(sourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
});

test("requestSubscriberRefresh aggregates mixed runner outcomes as partial", async () => {
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
        new Error("gpu failed"),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    supervisor.reconcile([
        buildCollectorGroup({
            pollingGroupId: "cpu",
            metricKeys: ["cpu.usage_percent"],
        }),
        buildCollectorGroup({
            pollingGroupId: "gpu",
            metricKeys: ["gpu.usage_percent"],
        }),
    ]);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "partial",
    });
    assert.deepEqual(sourceClient.requestedMetricKeys, [
        ["cpu.usage_percent"],
        ["gpu.usage_percent"],
    ]);
});

test("requestSubscriberRefresh aggregates failed-only outcomes as failed", async () => {
    const sourceClient = new FakeSourceClient("node-system", [
        new Error("source failed"),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: new FakeTimer(),
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "failed",
    });
});

test("requestSubscriberRefresh prioritizes failed over pending when no runner refreshed", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const pendingSourceClient = new FakeSourceClient("pending-source", [deferredSnapshot.promise]);
    const failedSourceClient = new FakeSourceClient("failed-source", [
        new Error("source failed"),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([pendingSourceClient, failedSourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: "pending-source",
            pollingGroupId: "pending",
            metricKeys: ["pending.metric"],
        }),
        buildCollectorGroup({
            sourceId: "failed-source",
            pollingGroupId: "failed",
            metricKeys: ["failed.metric"],
        }),
    ]);
    await fakeTimer.runNextWithDelay(0);

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "failed",
    });

    deferredSnapshot.resolve(buildSnapshot(1000, { "pending.metric": 42 }));
    await fakeTimer.drainMicrotasks();
});

test("requestSubscriberRefresh aggregates pending-only outcomes as pending", async () => {
    const fakeTimer = new FakeTimer();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient("node-system", [deferredSnapshot.promise]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);
    await fakeTimer.runNext();

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "pending",
    });

    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));
    await fakeTimer.drainMicrotasks();
});

test("requestSubscriberRefresh aggregates backoff-only outcomes as backoff", async () => {
    const fakeTimer = new FakeTimer();
    let currentTimestampMilliseconds = 0;
    const sourceClient = new FakeSourceClient("node-system", [
        new Error("source failed"),
        buildSnapshot(2000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => currentTimestampMilliseconds, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);
    await fakeTimer.runNext();

    assert.deepEqual(await supervisor.requestSubscriberRefresh("action-1", "manualInteraction"), {
        status: "backoff",
    });

    currentTimestampMilliseconds = 1000;
    await fakeTimer.runNextWithDelay(1000);
});

test("stopAll stops every active runner", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient("node-system", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);
    supervisor.stopAll();

    await fakeTimer.runNext();

    assert.deepEqual(sourceClient.requestedMetricKeys, []);
});

test("stopAll prevents in-flight runner results from writing", async () => {
    const fakeTimer = new FakeTimer();
    const metricStore = new MetricStore();
    const deferredSnapshot = createDeferred<MetricSnapshot>();
    const sourceClient = new FakeSourceClient("node-system", [deferredSnapshot.promise]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({ metricKeys: ["cpu.usage_percent"] }),
    ]);
    await fakeTimer.runNext();
    supervisor.stopAll();
    deferredSnapshot.resolve(buildSnapshot(1000, { "cpu.usage_percent": 42 }));
    await fakeTimer.drainMicrotasks();

    assert.equal(
        metricStore.forScope("local").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("slow collector groups do not block unrelated groups", async () => {
    const fakeTimer = new FakeTimer();
    const metricStore = new MetricStore();
    const slowGpuSnapshot = createDeferred<MetricSnapshot>();
    const gpuSourceClient = new FakeSourceClient("gpu-source", [slowGpuSnapshot.promise]);
    const cpuSourceClient = new FakeSourceClient("cpu-source", [
        buildSnapshot(1000, { "cpu.usage_percent": 42 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([gpuSourceClient, cpuSourceClient]),
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: "gpu-source",
            pollingGroupId: "gpu",
            metricKeys: ["gpu.usage_percent"],
        }),
        buildCollectorGroup({
            sourceId: "cpu-source",
            pollingGroupId: "cpu",
            metricKeys: ["cpu.usage_percent"],
        }),
    ]);

    await fakeTimer.runNext();
    await fakeTimer.runNext();

    assert.deepEqual(gpuSourceClient.requestedMetricKeys, [["gpu.usage_percent"]]);
    assert.deepEqual(cpuSourceClient.requestedMetricKeys, [["cpu.usage_percent"]]);
    assert.equal(
        metricStore.forScope("cpu-source").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        42,
    );
    assert.equal(
        metricStore.forScope("gpu-source").getWidgetData("gpu.usage_percent", "GPU", "%").sampleTimestampMilliseconds,
        undefined,
    );
});

test("reconcile sends Windows helper refresh demand from source-declared groups", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
            intervalMilliseconds: 1000,
        }),
    ]);
    await fakeTimer.drainMicrotasks();

    assert.deepEqual(sourceClient.refreshDemandGroups, [[{
        pollingGroupId: "lhm:hardware:cpu",
        metricKeys: ["cpu.temperature"],
        intervalMilliseconds: 1000,
    }]]);
});

test("reconcile coalesces unchanged Windows helper refresh demand", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });
    const collectorGroup = buildCollectorGroup({
        sourceId: WINDOWS_HELPER_SOURCE_ID,
        pollingGroupId: "lhm:hardware:cpu",
        metricKeys: ["cpu.temperature"],
    });

    supervisor.reconcile([collectorGroup]);
    await fakeTimer.drainMicrotasks();
    supervisor.reconcile([collectorGroup]);
    await fakeTimer.drainMicrotasks();

    assert.equal(sourceClient.refreshDemandGroups.length, 1);
});

test("Windows helper refresh demand renews while unchanged demand stays active", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 0),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();
    await fakeTimer.runNextWithDelay(8000);

    assert.equal(sourceClient.refreshDemandGroups.length, 2);
    assert.deepEqual(sourceClient.refreshDemandGroups[1], sourceClient.refreshDemandGroups[0]);
});

test("failed Windows helper refresh demand renewal schedules a retry", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();

    sourceClient.queueRefreshDemandFailure(new Error("resource exhausted"));
    await fakeTimer.runNextWithDelay(8000);

    assert.equal(sourceClient.refreshDemandGroups.length, 2);
    assert.equal(fakeTimer.recordedDelaysMilliseconds.at(-1), 2000);
});

test("invalid Windows helper refresh demand does not retry after helper recovery", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
        new Error("helper unavailable"),
        buildSnapshot(2000, { "cpu.temperature": 56 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 0),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();
    await fakeTimer.runNextWithDelay(0);
    await fakeTimer.runNextWithDelay(1000);

    sourceClient.queueRefreshDemandFailure(new SourceRefreshDemandError("invalidDemand", "invalid demand"));
    await fakeTimer.runNextWithDelay(8000);
    await fakeTimer.runNextWithDelay(1000);

    assert.equal(sourceClient.refreshDemandGroups.length, 2);
    assert.equal(await fakeTimer.runNextWithDelay(2000), false);
});

test("Windows helper recovery resends the latest active refresh demand", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
        new Error("helper unavailable"),
        buildSnapshot(2000, { "cpu.temperature": 56 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 0),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();
    await fakeTimer.runNextWithDelay(0);
    await fakeTimer.runNextWithDelay(1000);
    await fakeTimer.runNextWithDelay(1000);

    assert.equal(sourceClient.refreshDemandGroups.length, 2);
    assert.deepEqual(sourceClient.refreshDemandGroups[1], sourceClient.refreshDemandGroups[0]);
});

test("reconcile sends empty Windows helper refresh demand when helper groups disappear", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: new MetricStore(),
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();
    supervisor.reconcile([]);
    await fakeTimer.drainMicrotasks();

    assert.deepEqual(sourceClient.refreshDemandGroups.at(-1), []);
    assert.equal(await fakeTimer.runNextWithDelay(8000), false);
});

test("Windows helper refresh demand failure does not prevent collection runners", async () => {
    const fakeTimer = new FakeTimer();
    const sourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, [
        buildSnapshot(1000, { "cpu.temperature": 55 }),
    ]);
    sourceClient.queueRefreshDemandFailure(new Error("transient refresh demand failure"));
    const metricStore = new MetricStore();
    const supervisor = new CollectorGroupSupervisor({
        sourceRegistry: new FakeSourceRegistry([sourceClient]),
        snapshotStore: metricStore,
        createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        timer: fakeTimer,
    });

    supervisor.reconcile([
        buildCollectorGroup({
            sourceId: WINDOWS_HELPER_SOURCE_ID,
            pollingGroupId: "lhm:hardware:cpu",
            metricKeys: ["cpu.temperature"],
        }),
    ]);
    await fakeTimer.drainMicrotasks();
    await fakeTimer.runNextWithDelay(0);

    assert.equal(sourceClient.refreshDemandGroups.length, 2);
    assert.equal(
        metricStore.forScope(WINDOWS_HELPER_SOURCE_ID).getWidgetData("cpu.temperature", "CPU", "C").current,
        55,
    );
});

class FakeSourceRegistry {
    private readonly sourceClientsById = new Map<string, SourceClient>();

    constructor(sourceClients: readonly SourceClient[]) {
        for (const sourceClient of sourceClients) {
            this.sourceClientsById.set(sourceClient.sourceId, sourceClient);
        }
    }

    resolveSourceClient(sourceId: string): SourceClient | undefined {
        return this.sourceClientsById.get(sourceId);
    }

    register(sourceClient: SourceClient): void {
        this.sourceClientsById.set(sourceClient.sourceId, sourceClient);
    }
}

class FakeSourceClient implements SourceClient {
    readonly requestedMetricKeys: string[][] = [];
    readonly refreshDemandGroups: SourceRefreshDemandGroup[][] = [];
    private readonly refreshDemandFailures: unknown[] = [];
    private responseIndex = 0;

    constructor(
        readonly sourceId: string,
        private readonly responses: readonly (MetricSnapshot | Promise<MetricSnapshot> | Error)[],
    ) {}

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        this.requestedMetricKeys.push([...metricKeys]);
        const response = this.responses[this.responseIndex];
        this.responseIndex += 1;

        if (!response) {
            throw new Error("No fake source response queued.");
        }

        if (response instanceof Error) {
            throw response;
        }

        return {
            snapshot: await response,
            valueMetadata: [],
            unavailableMetrics: [],
        };
    }

    async setMetricRefreshDemand(groups: readonly SourceRefreshDemandGroup[]): Promise<void> {
        this.refreshDemandGroups.push(groups.map(group => ({
            pollingGroupId: group.pollingGroupId,
            metricKeys: [...group.metricKeys],
            intervalMilliseconds: group.intervalMilliseconds,
        })));

        const failure = this.refreshDemandFailures.shift();
        if (failure !== undefined) {
            throw failure;
        }
    }

    queueRefreshDemandFailure(error: unknown): void {
        this.refreshDemandFailures.push(error);
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [
            metricKey,
            { state: "owned", pollingGroupId: `${this.sourceId}:test` },
        ]));
    }
}

interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
    let resolveDeferred: ((value: T) => void) | null = null;
    const promise = new Promise<T>((resolve) => {
        resolveDeferred = resolve;
    });

    return {
        promise,
        resolve(value: T): void {
            if (!resolveDeferred) {
                throw new Error("Deferred promise was not initialized.");
            }

            resolveDeferred(value);
        },
    };
}

class FakeTimer {
    readonly recordedDelaysMilliseconds: number[] = [];
    private readonly handles: FakeTimerHandle[] = [];

    set(callback: () => void, delayMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
            delayMilliseconds,
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

        handle.active = false;
        handle.callback();
        await this.drainMicrotasks();
    }

    async runNextWithDelay(delayMilliseconds: number): Promise<boolean> {
        const handleIndex = this.handles.findIndex(handle => (
            handle.active && handle.delayMilliseconds === delayMilliseconds
        ));

        if (handleIndex === -1) {
            return false;
        }

        const [handle] = this.handles.splice(handleIndex, 1);

        if (!handle) {
            return false;
        }

        handle.callback();
        await this.drainMicrotasks();
        return true;
    }

    async drainMicrotasks(): Promise<void> {
        for (let tick = 0; tick < ASYNC_TIMER_DRAIN_MICROTASK_TICKS; tick += 1) {
            await Promise.resolve();
        }
    }

    private shiftNextActiveHandle(): FakeTimerHandle | undefined {
        const handleIndex = this.handles.findIndex(handle => handle.active);
        if (handleIndex === -1) {
            return undefined;
        }

        const [handle] = this.handles.splice(handleIndex, 1);
        return handle;
    }
}

interface FakeTimerHandle {
    active: boolean;
    delayMilliseconds: number;
    callback(): void;
}

function buildCollectorGroup(options: {
    readonly metricKeys: readonly string[];
    readonly intervalMilliseconds?: number;
    readonly sourceId?: string;
    readonly pollingGroupId?: string;
    readonly subscriberIds?: readonly string[];
}): PlannedCollectorGroup {
    const sourceId = options.sourceId ?? "node-system";
    const pollingGroupId = options.pollingGroupId ?? "cpu";

    return {
        collectorGroupKey: JSON.stringify(["local", sourceId, "sourceDeclared", pollingGroupId]),
        sourceScopeId: "local",
        sourceId,
        groupKind: "sourceDeclared",
        pollingGroupId,
        metricKeys: options.metricKeys,
        intervalMilliseconds: options.intervalMilliseconds ?? 1000,
        subscriberIds: options.subscriberIds ?? ["action-1"],
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

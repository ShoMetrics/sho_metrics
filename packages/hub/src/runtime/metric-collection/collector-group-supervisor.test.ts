import assert from "node:assert/strict";
import test from "node:test";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import { MetricStore } from "../metric-store";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type MetricSnapshot,
} from "../sources/metric-source";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { SourceClient } from "../sources/source-client";

// The runner callback chains through timer -> refreshNow -> readSnapshot ->
// ingest -> finally. Ten turns leaves margin for small async instrumentation.
const ASYNC_TIMER_DRAIN_MICROTASK_TICKS = 10;

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
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 5000]);
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
    private responseIndex = 0;

    constructor(
        readonly sourceId: string,
        private readonly responses: readonly (MetricSnapshot | Promise<MetricSnapshot>)[],
    ) {}

    async readSnapshot(metricKeys: readonly string[]): Promise<MetricSnapshot> {
        this.requestedMetricKeys.push([...metricKeys]);
        const response = this.responses[this.responseIndex];
        this.responseIndex += 1;

        if (!response) {
            throw new Error("No fake source response queued.");
        }

        return response;
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
        };
        this.handles.push(handle);
        this.recordedDelaysMilliseconds.push(delayMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as FakeTimerHandle).active = false;
    }

    async runNext(): Promise<void> {
        const handle = this.handles.shift();

        if (!handle || !handle.active) {
            return;
        }

        handle.callback();
        await this.drainMicrotasks();
    }

    async drainMicrotasks(): Promise<void> {
        for (let tick = 0; tick < ASYNC_TIMER_DRAIN_MICROTASK_TICKS; tick += 1) {
            await Promise.resolve();
        }
    }
}

interface FakeTimerHandle {
    active: boolean;
    callback(): void;
}

function buildCollectorGroup(options: {
    readonly metricKeys: readonly string[];
    readonly intervalMilliseconds?: number;
    readonly sourceId?: string;
    readonly pollingGroupId?: string;
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
        subscriberIds: ["action-1"],
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

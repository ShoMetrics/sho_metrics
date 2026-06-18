import assert from "node:assert/strict";
import test from "node:test";
import { CollectorGroupRunner } from "./collector-group-runner";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import type { CollectorGroupNoDataObserver } from "./collector-group-no-data-observer";
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

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed" });

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

    assert.deepEqual(await firstRefreshPromise, { status: "refreshed" });
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

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed" });
    assert.equal(
        metricStore.forScope("node-system").getWidgetData("cpu.usage_percent", "CPU", "%").current,
        55,
    );
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

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed" });

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

    assert.deepEqual(await runner.refreshNow(), { status: "refreshed" });

    assert.deepEqual(noDataObserver.observations.map(observation => observation.state), ["ok"]);
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

test("updateCollectorGroup applies the new metric set and interval on the next timer tick", async () => {
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
    assert.deepEqual(fakeTimer.recordedDelaysMilliseconds, [0, 1000, 5000]);
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
            valueAttributions: [],
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

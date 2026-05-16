import assert from "node:assert/strict";
import test from "node:test";
import { Scheduler, type MetricSnapshotStore } from "./scheduler";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    type IMetricSnapshot,
} from "./sources/source.interface";
import {
    buildLocalMetricReadPlan,
    LOCAL_SOURCE_SCOPE_ID,
    type MetricReadPlan,
} from "./sources/metric-read-plan";
import type { SourceRunner } from "./sources/source-runner";

test("subscribe polls read plans with sorted unique metric keys", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    const receivedSnapshots: IMetricSnapshot[] = [];

    const unsubscribe = scheduler.subscribe(snapshot => {
        receivedSnapshots.push(snapshot);
    }, {
        readPlan: buildLocalMetricReadPlan(["net.down", "cpu.usage_percent", "net.down"]),
    });

    try {
        await waitForCondition(() => receivedSnapshots.length === 1);

        assert.deepEqual(sourceRunner.polledReadPlans.map(readPlan => readPlan.metricKeys), [
            ["cpu.usage_percent", "net.down"],
        ]);
        assert.deepEqual(snapshotStore.ingestedSnapshots, [{
            sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
            snapshot: sourceRunner.snapshot,
        }]);
        assert.deepEqual(receivedSnapshots, [sourceRunner.snapshot]);
    } finally {
        unsubscribe();
    }
});

test("scheduler coalesces active subscribers with the same source plan", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    const firstSubscriberSnapshots: IMetricSnapshot[] = [];
    const secondSubscriberSnapshots: IMetricSnapshot[] = [];

    const unsubscribeFirst = scheduler.subscribe(snapshot => {
        firstSubscriberSnapshots.push(snapshot);
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
    });

    try {
        await waitForCondition(() => firstSubscriberSnapshots.length === 1);

        const unsubscribeSecond = scheduler.subscribe(snapshot => {
            secondSubscriberSnapshots.push(snapshot);
        }, {
            readPlan: buildLocalMetricReadPlan(["net.down"]),
        });

        try {
            await waitForCondition(() => sourceRunner.polledReadPlans.length === 2);

            assert.deepEqual(sourceRunner.polledReadPlans[1]?.metricKeys, [
                "cpu.usage_percent",
                "net.down",
            ]);
            assert.equal(secondSubscriberSnapshots.length, 1);
        } finally {
            unsubscribeSecond();
        }
    } finally {
        unsubscribeFirst();
    }
});

test("unsupported polling intervals still poll the requested metric keys", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    let callbackCount = 0;

    const unsubscribe = scheduler.subscribe(() => {
        callbackCount += 1;
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
        pollingIntervalMilliseconds: 1234,
    });

    try {
        await waitForCondition(() => callbackCount === 1);

        assert.deepEqual(sourceRunner.polledReadPlans.map(readPlan => readPlan.metricKeys), [["cpu.usage_percent"]]);
    } finally {
        unsubscribe();
    }
});

test("refreshMetrics polls and ingests requested metric keys without subscribers", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);

    const snapshot = await scheduler.refreshMetrics(
        buildLocalMetricReadPlan(["net.down", "cpu.usage_percent", "net.down"]),
    );

    assert.equal(snapshot, sourceRunner.snapshot);
    assert.deepEqual(sourceRunner.polledReadPlans.map(readPlan => readPlan.metricKeys), [
        ["cpu.usage_percent", "net.down"],
    ]);
    assert.deepEqual(snapshotStore.ingestedSnapshots, [{
        sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
        snapshot: sourceRunner.snapshot,
    }]);
});

test("dispose stops polling and disposes the source runner", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    let callbackCount = 0;

    scheduler.subscribe(() => {
        callbackCount += 1;
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
    });

    await waitForCondition(() => callbackCount === 1);
    scheduler.dispose();

    assert.equal(sourceRunner.disposeCount, 1);
});

test("later same-group subscribers do not join an in-flight initial poll", async () => {
    const sourceRunner = new DeferredSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    const firstSubscriberSnapshots: IMetricSnapshot[] = [];
    const secondSubscriberSnapshots: IMetricSnapshot[] = [];
    let unsubscribeSecond: (() => void) | undefined;

    const unsubscribeFirst = scheduler.subscribe(snapshot => {
        firstSubscriberSnapshots.push(snapshot);
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
    });

    try {
        await waitForCondition(() => sourceRunner.pendingPollCount === 1);

        unsubscribeSecond = scheduler.subscribe(snapshot => {
            secondSubscriberSnapshots.push(snapshot);
        }, {
            readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
        });

        sourceRunner.resolveNextPoll();
        await waitForCondition(() => firstSubscriberSnapshots.length === 1);

        assert.deepEqual(sourceRunner.polledReadPlans.map(readPlan => readPlan.metricKeys), [["cpu.usage_percent"]]);
        assert.deepEqual(firstSubscriberSnapshots, [sourceRunner.snapshot]);
        assert.deepEqual(secondSubscriberSnapshots, []);
    } finally {
        unsubscribeSecond?.();
        unsubscribeFirst();
    }
});

class FakeSourceRunner implements SourceRunner {
    readonly sourceId = "fake-source";
    readonly snapshot: IMetricSnapshot = buildTestSnapshot(this.sourceId);
    readonly polledReadPlans: MetricReadPlan[] = [];
    disposeCount = 0;

    async poll(readPlan: MetricReadPlan): Promise<IMetricSnapshot> {
        this.polledReadPlans.push(readPlan);
        return this.snapshot;
    }

    dispose(): void {
        this.disposeCount += 1;
    }
}

class DeferredSourceRunner implements SourceRunner {
    readonly sourceId = "deferred-source";
    readonly snapshot: IMetricSnapshot = buildTestSnapshot(this.sourceId);
    readonly polledReadPlans: MetricReadPlan[] = [];
    private readonly pendingPollResolvers: Array<(snapshot: IMetricSnapshot) => void> = [];

    get pendingPollCount(): number {
        return this.pendingPollResolvers.length;
    }

    poll(readPlan: MetricReadPlan): Promise<IMetricSnapshot> {
        this.polledReadPlans.push(readPlan);

        return new Promise(resolve => {
            this.pendingPollResolvers.push(resolve);
        });
    }

    resolveNextPoll(): void {
        const resolve = this.pendingPollResolvers.shift();

        assert.ok(resolve, "Expected a pending poll.");
        resolve(this.snapshot);
    }

    dispose(): void {
        return;
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

class FakeMetricSnapshotStore implements MetricSnapshotStore {
    readonly ingestedSnapshots: Array<{
        sourceScopeId: string;
        snapshot: IMetricSnapshot;
    }> = [];

    ingest(sourceScopeId: string, snapshot: IMetricSnapshot): void {
        this.ingestedSnapshots.push({ sourceScopeId, snapshot });
    }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
    const maximumAttemptCount = 80;

    for (let attemptIndex = 0; attemptIndex < maximumAttemptCount; attemptIndex++) {
        if (predicate()) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 25));
    }

    assert.fail("Timed out waiting for scheduler condition.");
}

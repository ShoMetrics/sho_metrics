import assert from "node:assert/strict";
import test from "node:test";
import { Scheduler, type MetricSnapshotStore } from "./scheduler";
import type { IMetricSource, IMetricSnapshot } from "./sources/source.interface";

test("subscribe polls metric key groups with sorted unique keys", async () => {
    const source = new FakeMetricSource();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(source, snapshotStore);
    const receivedSnapshots: IMetricSnapshot[] = [];

    const unsubscribe = scheduler.subscribe(snapshot => {
        receivedSnapshots.push(snapshot);
    }, {
        metricKeys: ["net.down", "cpu.usage_percent", "net.down"],
    });

    try {
        await waitForCondition(() => receivedSnapshots.length === 1);

        assert.deepEqual(source.polledMetricKeyListList, [["cpu.usage_percent", "net.down"]]);
        assert.deepEqual(snapshotStore.ingestedSnapshots, [source.snapshot]);
        assert.deepEqual(receivedSnapshots, [source.snapshot]);
    } finally {
        unsubscribe();
    }
});

test("scheduler falls back to poll when source has no pollMetrics implementation", async () => {
    const source = new PollOnlyMetricSource();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(source, snapshotStore);
    let receivedSnapshot: IMetricSnapshot | null = null;

    const unsubscribe = scheduler.subscribe(snapshot => {
        receivedSnapshot = snapshot;
    }, {
        metricKeys: ["cpu.usage_percent"],
    });

    try {
        await waitForCondition(() => receivedSnapshot != null);

        assert.equal(source.pollCount, 1);
        assert.deepEqual(snapshotStore.ingestedSnapshots, [source.snapshot]);
        assert.equal(receivedSnapshot, source.snapshot);
    } finally {
        unsubscribe();
    }
});

test("unsupported polling intervals still poll the requested metric keys", async () => {
    const source = new FakeMetricSource();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(source, snapshotStore);
    let callbackCount = 0;

    const unsubscribe = scheduler.subscribe(() => {
        callbackCount += 1;
    }, {
        metricKeys: ["cpu.usage_percent"],
        pollingIntervalMilliseconds: 1234,
    });

    try {
        await waitForCondition(() => callbackCount === 1);

        assert.deepEqual(source.polledMetricKeyListList, [["cpu.usage_percent"]]);
    } finally {
        unsubscribe();
    }
});

test("later same-group subscribers do not join an in-flight initial poll", async () => {
    const source = new DeferredMetricSource();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(source, snapshotStore);
    const firstSubscriberSnapshots: IMetricSnapshot[] = [];
    const secondSubscriberSnapshots: IMetricSnapshot[] = [];
    let unsubscribeSecond: (() => void) | undefined;

    const unsubscribeFirst = scheduler.subscribe(snapshot => {
        firstSubscriberSnapshots.push(snapshot);
    }, {
        metricKeys: ["cpu.usage_percent"],
    });

    try {
        await waitForCondition(() => source.pendingPollCount === 1);

        unsubscribeSecond = scheduler.subscribe(snapshot => {
            secondSubscriberSnapshots.push(snapshot);
        }, {
            metricKeys: ["cpu.usage_percent"],
        });

        source.resolveNextPoll();
        await waitForCondition(() => firstSubscriberSnapshots.length === 1);

        assert.deepEqual(source.polledMetricKeyListList, [["cpu.usage_percent"]]);
        assert.deepEqual(firstSubscriberSnapshots, [source.snapshot]);
        assert.deepEqual(secondSubscriberSnapshots, []);
    } finally {
        unsubscribeSecond?.();
        unsubscribeFirst();
    }
});

class FakeMetricSource implements IMetricSource {
    readonly sourceId = "fake-source";
    readonly snapshot: IMetricSnapshot = {
        sourceId: this.sourceId,
        timestampMs: 1000,
        metrics: {
            "cpu.usage_percent": { scalar: 42, unit: "%" },
        },
    };
    readonly polledMetricKeyListList: readonly string[][] = [];

    async poll(): Promise<IMetricSnapshot> {
        return this.snapshot;
    }

    async pollMetrics(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        (this.polledMetricKeyListList as string[][]).push([...metricKeys]);
        return this.snapshot;
    }
}

class DeferredMetricSource implements IMetricSource {
    readonly sourceId = "deferred-source";
    readonly snapshot: IMetricSnapshot = {
        sourceId: this.sourceId,
        timestampMs: 1000,
        metrics: {
            "cpu.usage_percent": { scalar: 42, unit: "%" },
        },
    };
    readonly polledMetricKeyListList: string[][] = [];
    private readonly pendingPollResolvers: Array<(snapshot: IMetricSnapshot) => void> = [];

    get pendingPollCount(): number {
        return this.pendingPollResolvers.length;
    }

    poll(): Promise<IMetricSnapshot> {
        return this.pollMetrics([]);
    }

    pollMetrics(metricKeys: readonly string[]): Promise<IMetricSnapshot> {
        this.polledMetricKeyListList.push([...metricKeys]);

        return new Promise(resolve => {
            this.pendingPollResolvers.push(resolve);
        });
    }

    resolveNextPoll(): void {
        const resolve = this.pendingPollResolvers.shift();

        assert.ok(resolve, "Expected a pending poll.");
        resolve(this.snapshot);
    }
}

class PollOnlyMetricSource implements IMetricSource {
    readonly sourceId = "poll-only-source";
    readonly snapshot: IMetricSnapshot = {
        sourceId: this.sourceId,
        timestampMs: 1000,
        metrics: {
            "cpu.usage_percent": { scalar: 42, unit: "%" },
        },
    };
    pollCount = 0;

    async poll(): Promise<IMetricSnapshot> {
        this.pollCount += 1;
        return this.snapshot;
    }
}

class FakeMetricSnapshotStore implements MetricSnapshotStore {
    readonly ingestedSnapshots: IMetricSnapshot[] = [];

    ingest(snapshot: IMetricSnapshot): void {
        this.ingestedSnapshots.push(snapshot);
    }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
    const maximumAttemptCount = 20;

    for (let attemptIndex = 0; attemptIndex < maximumAttemptCount; attemptIndex++) {
        if (predicate()) {
            return;
        }

        await new Promise(resolve => setImmediate(resolve));
    }

    assert.fail("Timed out waiting for scheduler condition.");
}

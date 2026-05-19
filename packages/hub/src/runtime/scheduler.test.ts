import assert from "node:assert/strict";
import test from "node:test";
import { Scheduler, type MetricSnapshotStore } from "./scheduler";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    MetricUnit,
    type MetricSnapshot,
} from "./sources/metric-source";
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
    const receivedSnapshots: MetricSnapshot[] = [];

    const unsubscribe = scheduler.subscribe(snapshot => {
        receivedSnapshots.push(snapshot);
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.model", "cpu.usage_percent", "cpu.model"]),
    });

    try {
        await waitForCondition(() => receivedSnapshots.length === 1);

        assert.deepEqual(sourceRunner.polledReadPlans.map(readPlan => readPlan.metricKeys), [
            ["cpu.model", "cpu.usage_percent"],
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

test("scheduler coalesces active subscribers with the same polling group", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    const firstSubscriberSnapshots: MetricSnapshot[] = [];
    const secondSubscriberSnapshots: MetricSnapshot[] = [];

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
            readPlan: buildLocalMetricReadPlan(["cpu.model"]),
        });

        try {
            await waitForCondition(() => sourceRunner.polledReadPlans.length === 2);

            assert.deepEqual(sourceRunner.polledReadPlans[1]?.metricKeys, [
                "cpu.model",
                "cpu.usage_percent",
            ]);
            assert.equal(secondSubscriberSnapshots.length, 1);
        } finally {
            unsubscribeSecond();
        }
    } finally {
        unsubscribeFirst();
    }
});

test("scheduler polls different metric groups independently", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    let cpuCallbackCount = 0;
    let networkCallbackCount = 0;

    const unsubscribeCpu = scheduler.subscribe(() => {
        cpuCallbackCount += 1;
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
    });

    try {
        await waitForCondition(() => cpuCallbackCount === 1);

        const unsubscribeNetwork = scheduler.subscribe(() => {
            networkCallbackCount += 1;
        }, {
            readPlan: buildLocalMetricReadPlan(["net.down"]),
        });

        try {
            await waitForCondition(() => {
                const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

                return hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"])
                    && hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["net.down"]);
            });

            const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

            assert.equal(hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"]), true);
            assert.equal(hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["net.down"]), true);
            assert.equal(networkCallbackCount > 0, true);
            assert.equal(
                scheduledPolls.some(readPlan => areMetricKeysEqual(readPlan.metricKeys, [
                    "cpu.usage_percent",
                    "net.down",
                ])),
                false,
            );
        } finally {
            unsubscribeNetwork();
        }
    } finally {
        unsubscribeCpu();
    }
});

test("single subscriber with multiple polling groups receives one callback per group", async () => {
    const sourceRunner = new EchoSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    const receivedSnapshots: MetricSnapshot[] = [];

    const unsubscribe = scheduler.subscribe(snapshot => {
        receivedSnapshots.push(snapshot);
    }, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent", "net.down"]),
    });

    try {
        await waitForCondition(() => receivedSnapshots.length === 2);

        assert.equal(
            hasPolledReadPlan(sourceRunner.polledReadPlans, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"]),
            true,
        );
        assert.equal(
            hasPolledReadPlan(sourceRunner.polledReadPlans, LOCAL_SOURCE_SCOPE_ID, ["net.down"]),
            true,
        );
        assert.deepEqual(receivedSnapshots.map(snapshot => Object.keys(snapshot.metrics).sort()), [
            ["cpu.usage_percent"],
            ["net.down"],
        ]);
        assert.deepEqual(snapshotStore.ingestedSnapshots.map(entry => Object.keys(entry.snapshot.metrics).sort()), [
            ["cpu.usage_percent"],
            ["net.down"],
        ]);
    } finally {
        unsubscribe();
    }
});

test("different source scopes perform separate polls", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);

    const unsubscribeFirst = scheduler.subscribe(() => undefined, {
        readPlan: buildScopedMetricReadPlan(LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"]),
    });

    try {
        await waitForCondition(() => sourceRunner.polledReadPlans.length === 1);

        const unsubscribeSecond = scheduler.subscribe(() => undefined, {
            readPlan: buildScopedMetricReadPlan("remote-host", ["net.down"]),
        });

        try {
            await waitForCondition(() => {
                const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

                return hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"])
                    && hasPolledReadPlan(scheduledPolls, "remote-host", ["net.down"]);
            });

            const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

            assert.equal(hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"]), true);
            assert.equal(hasPolledReadPlan(scheduledPolls, "remote-host", ["net.down"]), true);
        } finally {
            unsubscribeSecond();
        }
    } finally {
        unsubscribeFirst();
    }
});

test("different polling intervals perform separate polls", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);

    const unsubscribeFirst = scheduler.subscribe(() => undefined, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
        pollingIntervalMilliseconds: 1000,
    });

    try {
        await waitForCondition(() => sourceRunner.polledReadPlans.length === 1);

        const unsubscribeSecond = scheduler.subscribe(() => undefined, {
            readPlan: buildLocalMetricReadPlan(["net.down"]),
            pollingIntervalMilliseconds: 2000,
        });

        try {
            await waitForCondition(() => {
                const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

                return hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"])
                    && hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["net.down"]);
            });

            const scheduledPolls = sourceRunner.polledReadPlans.slice(1);

            assert.equal(hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["cpu.usage_percent"]), true);
            assert.equal(hasPolledReadPlan(scheduledPolls, LOCAL_SOURCE_SCOPE_ID, ["net.down"]), true);
        } finally {
            unsubscribeSecond();
        }
    } finally {
        unsubscribeFirst();
    }
});

test("unsubscribing one same-group subscriber keeps the group schedule", async () => {
    const sourceRunner = new FakeSourceRunner();
    const snapshotStore = new FakeMetricSnapshotStore();
    const scheduler = new Scheduler(sourceRunner, snapshotStore);
    let unsubscribeSecond: (() => void) | undefined;

    const unsubscribeFirst = scheduler.subscribe(() => undefined, {
        readPlan: buildLocalMetricReadPlan(["cpu.usage_percent"]),
        pollingIntervalMilliseconds: 2000,
    });

    try {
        await waitForCondition(() => sourceRunner.polledReadPlans.length === 1);

        unsubscribeSecond = scheduler.subscribe(() => undefined, {
            readPlan: buildLocalMetricReadPlan(["cpu.model"]),
            pollingIntervalMilliseconds: 2000,
        });

        await waitForCondition(() => sourceRunner.polledReadPlans.length === 2);
        unsubscribeSecond();
        unsubscribeSecond = undefined;

        await waitForMilliseconds(1100);

        assert.equal(sourceRunner.polledReadPlans.length, 2);
    } finally {
        unsubscribeSecond?.();
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
    const firstSubscriberSnapshots: MetricSnapshot[] = [];
    const secondSubscriberSnapshots: MetricSnapshot[] = [];
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
    readonly snapshot: MetricSnapshot = buildTestSnapshot();
    readonly polledReadPlans: MetricReadPlan[] = [];
    disposeCount = 0;

    async poll(readPlan: MetricReadPlan): Promise<MetricSnapshot> {
        this.polledReadPlans.push(readPlan);
        return this.snapshot;
    }

    dispose(): void {
        this.disposeCount += 1;
    }
}

class EchoSourceRunner implements SourceRunner {
    readonly polledReadPlans: MetricReadPlan[] = [];

    async poll(readPlan: MetricReadPlan): Promise<MetricSnapshot> {
        this.polledReadPlans.push(readPlan);

        return buildMetricSnapshot({
            timestampMilliseconds: 1000,
            metrics: Object.fromEntries(
                readPlan.metricKeys.map(metricKey => [
                    metricKey,
                    buildScalarMetricValue(42, { unit: MetricUnit.PERCENT }),
                ]),
            ),
        });
    }

    dispose(): void {
        return;
    }
}

class DeferredSourceRunner implements SourceRunner {
    readonly sourceId = "deferred-source";
    readonly snapshot: MetricSnapshot = buildTestSnapshot();
    readonly polledReadPlans: MetricReadPlan[] = [];
    private readonly pendingPollResolvers: Array<(snapshot: MetricSnapshot) => void> = [];

    get pendingPollCount(): number {
        return this.pendingPollResolvers.length;
    }

    poll(readPlan: MetricReadPlan): Promise<MetricSnapshot> {
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

function buildTestSnapshot(): MetricSnapshot {
    return buildMetricSnapshot({
        timestampMilliseconds: 1000,
        metrics: {
            "cpu.usage_percent": buildScalarMetricValue(42, { unit: MetricUnit.PERCENT }),
        },
    });
}

function buildScopedMetricReadPlan(sourceScopeId: string, metricKeys: readonly string[]): MetricReadPlan {
    return {
        ...buildLocalMetricReadPlan(metricKeys),
        sourceScopeId,
    };
}

function hasPolledReadPlan(
    readPlans: readonly MetricReadPlan[],
    sourceScopeId: string,
    metricKeys: readonly string[],
): boolean {
    return readPlans.some(readPlan =>
        readPlan.sourceScopeId === sourceScopeId
        && areMetricKeysEqual(readPlan.metricKeys, metricKeys));
}

function areMetricKeysEqual(firstMetricKeys: readonly string[], secondMetricKeys: readonly string[]): boolean {
    return firstMetricKeys.length === secondMetricKeys.length
        && firstMetricKeys.every((metricKey, index) => metricKey === secondMetricKeys[index]);
}

class FakeMetricSnapshotStore implements MetricSnapshotStore {
    readonly ingestedSnapshots: Array<{
        sourceScopeId: string;
        snapshot: MetricSnapshot;
    }> = [];

    ingest(sourceScopeId: string, snapshot: MetricSnapshot): void {
        this.ingestedSnapshots.push({ sourceScopeId, snapshot });
    }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
    const maximumAttemptCount = 160;

    for (let attemptIndex = 0; attemptIndex < maximumAttemptCount; attemptIndex++) {
        if (predicate()) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 25));
    }

    assert.fail("Timed out waiting for scheduler condition.");
}

async function waitForMilliseconds(milliseconds: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
}

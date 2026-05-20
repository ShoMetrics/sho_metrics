import assert from "node:assert/strict";
import test from "node:test";
import type { MetricSubscription } from "../../runtime/metric-collection/metric-subscription-registry";
import type { MetricReadPlan } from "../../runtime/sources/metric-read-plan";
import { BackgroundCollectionBinding, type BackgroundCollectionBindingTimer } from "./background-collection-binding";

interface CollectionRegistrationRecord {
    readonly subscriberId: string;
    readonly metricSubscriptions: readonly MetricSubscription[];
    cleanupCallCount: number;
}

test("first refresh registers collection and starts render timer", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(
        options => {
            const record = {
                ...options,
                cleanupCallCount: 0,
            };
            registrations.push(record);
            return () => {
                record.cleanupCallCount += 1;
            };
        },
        timer,
        () => false,
    );
    let tickCount = 0;

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            metricSubscriptions: [buildSubscription("action-1", "memory.used", 1000)],
            pollingIntervalMilliseconds: 1000,
            maximumSampleAgeMilliseconds: 6000,
            onTick: () => {
                tickCount += 1;
            },
        });
        timer.runAll();

        assert.equal(registrations.length, 1);
        assert.deepEqual(registrations[0].metricSubscriptions, [
            buildSubscription("action-1", "memory.used", 1000),
        ]);
        assert.deepEqual(timer.recordedIntervalsMilliseconds, [1000, 500]);
        assert.equal(tickCount, 1);
    } finally {
        binding.dispose();
    }
});

test("refresh with the same read plan and interval keeps existing collection", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const binding = new BackgroundCollectionBinding(
        options => {
            const record = {
                ...options,
                cleanupCallCount: 0,
            };
            registrations.push(record);
            return () => {
                record.cleanupCallCount += 1;
            };
        },
        new FakeTimer(),
        () => false,
    );

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            metricSubscriptions: [buildSubscription("action-1", "memory.used", 1000)],
            pollingIntervalMilliseconds: 1000,
            maximumSampleAgeMilliseconds: 6000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            metricSubscriptions: [buildSubscription("action-1", "memory.used", 1000)],
            pollingIntervalMilliseconds: 1000,
            maximumSampleAgeMilliseconds: 6000,
            onTick: () => undefined,
        });

        assert.equal(registrations.length, 1);
        assert.equal(registrations[0].cleanupCallCount, 0);
    } finally {
        binding.dispose();
    }
});

test("refresh with a different plan replaces collection and render timer", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(
        options => {
            const record = {
                ...options,
                cleanupCallCount: 0,
            };
            registrations.push(record);
            return () => {
                record.cleanupCallCount += 1;
            };
        },
        timer,
        () => false,
    );

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            metricSubscriptions: [buildSubscription("action-1", "memory.used", 1000)],
            pollingIntervalMilliseconds: 1000,
            maximumSampleAgeMilliseconds: 6000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.total"]),
            metricSubscriptions: [buildSubscription("action-1", "memory.total", 5000)],
            pollingIntervalMilliseconds: 5000,
            maximumSampleAgeMilliseconds: 10000,
            onTick: () => undefined,
        });

        assert.equal(registrations.length, 2);
        assert.equal(registrations[0].cleanupCallCount, 1);
        assert.deepEqual(registrations[1].metricSubscriptions, [
            buildSubscription("action-1", "memory.total", 5000),
        ]);
        assert.deepEqual(timer.recordedIntervalsMilliseconds, [1000, 500, 5000, 500]);
        assert.equal(timer.clearedHandleCount, 2);
    } finally {
        binding.dispose();
    }
});

test("dispose unregisters collection and clears render timer", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(
        options => {
            const record = {
                ...options,
                cleanupCallCount: 0,
            };
            registrations.push(record);
            return () => {
                record.cleanupCallCount += 1;
            };
        },
        timer,
        () => false,
    );

    binding.refresh({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["memory.used"]),
        metricSubscriptions: [buildSubscription("action-1", "memory.used", 1000)],
        pollingIntervalMilliseconds: 1000,
        maximumSampleAgeMilliseconds: 6000,
        onTick: () => undefined,
    });
    binding.dispose();
    binding.dispose();

    assert.equal(registrations[0].cleanupCallCount, 1);
    assert.equal(timer.clearedHandleCount, 2);
});

test("first-reading warmup renders once when any subscribed metric receives a reading", () => {
    const metricKeysWithReadings = new Set<string>();
    const checkedMaximumSampleAgeMilliseconds: number[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(
        () => () => undefined,
        timer,
        (readPlan, maximumSampleAgeMilliseconds) => {
            checkedMaximumSampleAgeMilliseconds.push(maximumSampleAgeMilliseconds);
            return readPlan.metricKeys.some(metricKey => metricKeysWithReadings.has(metricKey));
        },
    );
    let tickCount = 0;

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["disk.usage.percent", "disk.usage.available"]),
            metricSubscriptions: [
                buildSubscription("action-1", "disk.usage.percent", 60000),
                buildSubscription("action-1", "disk.usage.available", 60000),
            ],
            pollingIntervalMilliseconds: 60000,
            maximumSampleAgeMilliseconds: 65000,
            onTick: () => {
                tickCount += 1;
            },
        });

        timer.runByInterval(500);
        metricKeysWithReadings.add("disk.usage.percent");
        timer.runByInterval(500);
        metricKeysWithReadings.add("disk.usage.available");
        timer.runByInterval(500);

        assert.equal(tickCount, 1);
        assert.deepEqual(checkedMaximumSampleAgeMilliseconds, [65000, 65000]);
        assert.equal(timer.clearedHandleCount, 1);
    } finally {
        binding.dispose();
    }
});

class FakeTimer implements BackgroundCollectionBindingTimer {
    readonly recordedIntervalsMilliseconds: number[] = [];
    private readonly handles: FakeTimerHandle[] = [];
    clearedHandleCount = 0;

    set(callback: () => void, intervalMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
            intervalMilliseconds,
        };
        this.handles.push(handle);
        this.recordedIntervalsMilliseconds.push(intervalMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as { active: boolean }).active = false;
        this.clearedHandleCount += 1;
    }

    runAll(): void {
        for (const handle of this.handles) {
            if (handle.active) {
                handle.callback();
            }
        }
    }

    runByInterval(intervalMilliseconds: number): void {
        for (const handle of this.handles) {
            if (handle.active && handle.intervalMilliseconds === intervalMilliseconds) {
                handle.callback();
            }
        }
    }
}

interface FakeTimerHandle {
    active: boolean;
    readonly callback: () => void;
    readonly intervalMilliseconds: number;
}

function buildReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys,
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "empty",
    };
}

function buildSubscription(
    subscriberId: string,
    metricKey: string,
    intervalMilliseconds: number,
): MetricSubscription {
    return {
        subscriberId,
        metricKey,
        sourceScopeId: "local",
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "empty",
        intervalMilliseconds,
    };
}

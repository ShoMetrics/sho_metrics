import assert from "node:assert/strict";
import test from "node:test";
import type { MetricReadPlan } from "../../runtime/sources/metric-read-plan";
import { BackgroundCollectionBinding, type BackgroundCollectionBindingTimer } from "./background-collection-binding";

interface CollectionRegistrationRecord {
    readonly subscriberId: string;
    readonly readPlan: MetricReadPlan;
    readonly intervalMilliseconds: number;
    cleanupCallCount: number;
}

test("first refresh registers collection and starts render cadence", () => {
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
    );
    let tickCount = 0;

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => {
                tickCount += 1;
            },
        });
        timer.runAll();

        assert.equal(registrations.length, 1);
        assert.deepEqual(registrations[0].readPlan.metricKeys, ["memory.used"]);
        assert.equal(registrations[0].intervalMilliseconds, 1000);
        assert.deepEqual(timer.recordedIntervalsMilliseconds, [1000]);
        assert.equal(tickCount, 1);
    } finally {
        binding.dispose();
    }
});

test("refresh with the same read plan and interval keeps existing collection", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const binding = new BackgroundCollectionBinding(options => {
        const record = {
            ...options,
            cleanupCallCount: 0,
        };
        registrations.push(record);
        return () => {
            record.cleanupCallCount += 1;
        };
    }, new FakeTimer());

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(registrations.length, 1);
        assert.equal(registrations[0].cleanupCallCount, 0);
    } finally {
        binding.dispose();
    }
});

test("refresh with a different plan replaces collection and cadence", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(options => {
        const record = {
            ...options,
            cleanupCallCount: 0,
        };
        registrations.push(record);
        return () => {
            record.cleanupCallCount += 1;
        };
    }, timer);

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.used"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["memory.total"]),
            pollingIntervalMilliseconds: 5000,
            onTick: () => undefined,
        });

        assert.equal(registrations.length, 2);
        assert.equal(registrations[0].cleanupCallCount, 1);
        assert.deepEqual(registrations[1].readPlan.metricKeys, ["memory.total"]);
        assert.deepEqual(timer.recordedIntervalsMilliseconds, [1000, 5000]);
        assert.equal(timer.clearedHandleCount, 1);
    } finally {
        binding.dispose();
    }
});

test("dispose unregisters collection and clears cadence", () => {
    const registrations: CollectionRegistrationRecord[] = [];
    const timer = new FakeTimer();
    const binding = new BackgroundCollectionBinding(options => {
        const record = {
            ...options,
            cleanupCallCount: 0,
        };
        registrations.push(record);
        return () => {
            record.cleanupCallCount += 1;
        };
    }, timer);

    binding.refresh({
        subscriberId: "action-1",
        readPlan: buildReadPlan(["memory.used"]),
        pollingIntervalMilliseconds: 1000,
        onTick: () => undefined,
    });
    binding.dispose();
    binding.dispose();

    assert.equal(registrations[0].cleanupCallCount, 1);
    assert.equal(timer.clearedHandleCount, 1);
});

class FakeTimer implements BackgroundCollectionBindingTimer {
    readonly recordedIntervalsMilliseconds: number[] = [];
    private readonly callbacks: Array<() => void> = [];
    clearedHandleCount = 0;

    set(callback: () => void, intervalMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
        };
        this.callbacks.push(() => {
            if (handle.active) {
                callback();
            }
        });
        this.recordedIntervalsMilliseconds.push(intervalMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as { active: boolean }).active = false;
        this.clearedHandleCount += 1;
    }

    runAll(): void {
        for (const callback of this.callbacks) {
            callback();
        }
    }
}

function buildReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys,
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "empty",
    };
}

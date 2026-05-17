import assert from "node:assert/strict";
import test from "node:test";
import { scheduler } from "../../runtime/scheduler";
import type { MetricReadPlan } from "../../runtime/sources/metric-read-plan";
import { SchedulerBinding } from "./scheduler-binding";

type SchedulerSubscribe = typeof scheduler.subscribe;
type SchedulerSubscriber = Parameters<SchedulerSubscribe>[0];
type SchedulerSubscribeOptions = Parameters<SchedulerSubscribe>[1];

interface SchedulerSubscriptionRecord {
    readonly callback: SchedulerSubscriber;
    readonly options: SchedulerSubscribeOptions;
    cleanupCallCount: number;
}

interface SchedulerSubscribeRecorder {
    readonly records: SchedulerSubscriptionRecord[];
    restore(): void;
}

test("first refresh subscribes", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 1);
        assert.deepEqual(recorder.records[0].options.readPlan.metricKeys, ["cpu.usage"]);
        assert.equal(recorder.records[0].options.pollingIntervalMilliseconds, 1000);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("refresh with the same read plan and polling interval does not resubscribe", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 1);
        assert.equal(recorder.records[0].cleanupCallCount, 0);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("refresh with a different read plan signature resubscribes", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            readPlan: buildReadPlan(["memory.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 2);
        assert.equal(recorder.records[0].cleanupCallCount, 1);
        assert.deepEqual(recorder.records[1].options.readPlan.metricKeys, ["memory.usage"]);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("refresh with a different polling interval resubscribes", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 5000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 2);
        assert.equal(recorder.records[0].cleanupCallCount, 1);
        assert.equal(recorder.records[1].options.pollingIntervalMilliseconds, 5000);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("dispose then refresh always subscribes", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.dispose();
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 2);
        assert.equal(recorder.records[0].cleanupCallCount, 1);
        assert.equal(recorder.records[1].cleanupCallCount, 0);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("dispose twice is safe", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.refresh({
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.dispose();
        binding.dispose();

        assert.equal(recorder.records.length, 1);
        assert.equal(recorder.records[0].cleanupCallCount, 1);
    } finally {
        recorder.restore();
    }
});

test("dispose without prior refresh is safe", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding();

    try {
        binding.dispose();

        assert.deepEqual(recorder.records, []);
    } finally {
        recorder.restore();
    }
});

function installSchedulerSubscribeRecorder(): SchedulerSubscribeRecorder {
    const originalSubscribe = scheduler.subscribe;
    const records: SchedulerSubscriptionRecord[] = [];

    scheduler.subscribe = ((callback: SchedulerSubscriber, options: SchedulerSubscribeOptions) => {
        const record: SchedulerSubscriptionRecord = {
            callback,
            options,
            cleanupCallCount: 0,
        };
        records.push(record);

        return () => {
            record.cleanupCallCount += 1;
        };
    }) as SchedulerSubscribe;

    return {
        records,
        restore: () => {
            scheduler.subscribe = originalSubscribe;
        },
    };
}

function buildReadPlan(metricKeys: readonly string[]): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys,
        sourceCandidates: [{ sourceId: "node-system" }],
        failureMode: "fallback",
    };
}

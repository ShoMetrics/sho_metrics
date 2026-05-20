import assert from "node:assert/strict";
import test from "node:test";
import { scheduler } from "../../runtime/scheduler";
import type { MetricReadPlan } from "../../runtime/sources/metric-read-plan";
import { SchedulerBinding } from "./scheduler-binding";
import type {
    MetricReadPlanSubscriptionBridgeWriter,
    RegisterMetricReadPlanSubscriptionBridgeOptions,
} from "../../runtime/metric-collection/metric-subscription-registry";

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
    const registry = new FakeMetricSubscriptionRegistry();
    const binding = new SchedulerBinding(registry);

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });

        assert.equal(recorder.records.length, 1);
        assert.deepEqual(recorder.records[0].options.readPlan.metricKeys, ["cpu.usage"]);
        assert.equal(recorder.records[0].options.pollingIntervalMilliseconds, 1000);
        assert.deepEqual(registry.registeredOptions.map(options => options.subscriberId), ["action-1"]);
    } finally {
        binding.dispose();
        recorder.restore();
    }
});

test("refresh with the same read plan and polling interval does not resubscribe", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const binding = new SchedulerBinding(new FakeMetricSubscriptionRegistry());

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
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
    const binding = new SchedulerBinding(new FakeMetricSubscriptionRegistry());

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
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
    const binding = new SchedulerBinding(new FakeMetricSubscriptionRegistry());

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.refresh({
            subscriberId: "action-1",
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
    const binding = new SchedulerBinding(new FakeMetricSubscriptionRegistry());

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.dispose();
        binding.refresh({
            subscriberId: "action-1",
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
    const registry = new FakeMetricSubscriptionRegistry();
    const binding = new SchedulerBinding(registry);

    try {
        binding.refresh({
            subscriberId: "action-1",
            readPlan: buildReadPlan(["cpu.usage"]),
            pollingIntervalMilliseconds: 1000,
            onTick: () => undefined,
        });
        binding.dispose();
        binding.dispose();

        assert.equal(recorder.records.length, 1);
        assert.equal(recorder.records[0].cleanupCallCount, 1);
        assert.deepEqual(registry.unregisteredSubscriberIds, ["action-1"]);
    } finally {
        recorder.restore();
    }
});

test("dispose without prior refresh is safe", () => {
    const recorder = installSchedulerSubscribeRecorder();
    const registry = new FakeMetricSubscriptionRegistry();
    const binding = new SchedulerBinding(registry);

    try {
        binding.dispose();

        assert.deepEqual(recorder.records, []);
        assert.deepEqual(registry.unregisteredSubscriberIds, []);
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

class FakeMetricSubscriptionRegistry implements MetricReadPlanSubscriptionBridgeWriter {
    readonly registeredOptions: RegisterMetricReadPlanSubscriptionBridgeOptions[] = [];
    readonly unregisteredSubscriberIds: string[] = [];

    registerReadPlanBridge(options: RegisterMetricReadPlanSubscriptionBridgeOptions): void {
        this.registeredOptions.push(options);
    }

    unregister(subscriberId: string): void {
        this.unregisteredSubscriberIds.push(subscriberId);
    }
}

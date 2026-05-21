import assert from "node:assert/strict";
import test from "node:test";
import { CollectorGroupPlanner } from "./collector-group-planner";
import type { MetricSubscription } from "./metric-subscription-registry";
import type { MetricSnapshot } from "../sources/metric-source";
import type { SourceClient } from "../sources/source-client";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import type { SourceRegistry } from "../sources/source-registry";

test("plans one background group per source candidate and polling group", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", metricKey => {
            if (metricKey === "cpu.usage_percent" || metricKey === "gpu.temp") {
                return { state: "owned", pollingGroupId: "lhm-snapshot" };
            }

            return { state: "unknown" };
        }),
        new FakeSourceClient("node-system", metricKey => {
            if (metricKey === "cpu.usage_percent") {
                return { state: "owned", pollingGroupId: "cpu" };
            }

            if (metricKey === "gpu.temp") {
                return { state: "owned", pollingGroupId: "gpu-telemetry" };
            }

            return { state: "unknown" };
        }),
    ]));

    const groups = planner.plan([
        buildSubscription({ metricKey: "cpu.usage_percent" }),
        buildSubscription({ metricKey: "gpu.temp" }),
    ]);

    assert.deepEqual(groups.map(group => ({
        sourceId: group.sourceId,
        groupKind: group.groupKind,
        pollingGroupId: group.groupKind === "sourceDeclared" ? group.pollingGroupId : null,
        metricKeys: group.metricKeys,
    })), [
        {
            sourceId: "windows-helper",
            groupKind: "sourceDeclared",
            pollingGroupId: "lhm-snapshot",
            metricKeys: ["cpu.usage_percent", "gpu.temp"],
        },
        {
            sourceId: "node-system",
            groupKind: "sourceDeclared",
            pollingGroupId: "cpu",
            metricKeys: ["cpu.usage_percent"],
        },
        {
            sourceId: "node-system",
            groupKind: "sourceDeclared",
            pollingGroupId: "gpu-telemetry",
            metricKeys: ["gpu.temp"],
        },
    ]);
});

test("coalesces same source group and uses the minimum active interval", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("node-system", () => ({
            state: "owned",
            pollingGroupId: "network-traffic",
        })),
    ]));

    const groups = planner.plan([
        buildSubscription({
            subscriberId: "action-1",
            metricKey: "net.down",
            sourceIds: ["node-system"],
            intervalMilliseconds: 5000,
        }),
        buildSubscription({
            subscriberId: "action-2",
            metricKey: "net.up",
            sourceIds: ["node-system"],
            intervalMilliseconds: 1000,
        }),
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], {
        collectorGroupKey: JSON.stringify(["local", "node-system", "sourceDeclared", "network-traffic"]),
        sourceScopeId: "local",
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        pollingGroupId: "network-traffic",
        metricKeys: ["net.down", "net.up"],
        intervalMilliseconds: 1000,
        subscriberIds: ["action-1", "action-2"],
    });
});

test("coalesces the same metric for multiple subscribers", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("node-system", () => ({ state: "owned", pollingGroupId: "cpu" })),
    ]));

    const groups = planner.plan([
        buildSubscription({
            subscriberId: "action-1",
            metricKey: "cpu.usage_percent",
            sourceIds: ["node-system"],
            intervalMilliseconds: 5000,
        }),
        buildSubscription({
            subscriberId: "action-2",
            metricKey: "cpu.usage_percent",
            sourceIds: ["node-system"],
            intervalMilliseconds: 1000,
        }),
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]?.metricKeys, ["cpu.usage_percent"]);
    assert.deepEqual(groups[0]?.subscriberIds, ["action-1", "action-2"]);
    assert.equal(groups[0]?.intervalMilliseconds, 1000);
});

test("keeps different source scopes in separate collector groups", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("source-profile:weather", () => ({
            state: "owned",
            pollingGroupId: "http-json-response",
        })),
    ]));

    const groups = planner.plan([
        buildSubscription({
            subscriberId: "weather-1",
            metricKey: "catalog.weather.temperature",
            sourceIds: ["source-profile:weather"],
            sourceScopeId: "profile:weather-primary",
        }),
        buildSubscription({
            subscriberId: "weather-2",
            metricKey: "catalog.weather.temperature",
            sourceIds: ["source-profile:weather"],
            sourceScopeId: "profile:weather-backup",
        }),
    ]);

    assert.equal(groups.length, 2);
    assert.notEqual(groups[0]?.collectorGroupKey, groups[1]?.collectorGroupKey);
    assert.deepEqual(groups.map(group => group.sourceScopeId).sort(), [
        "profile:weather-backup",
        "profile:weather-primary",
    ]);
});

test("keeps unknown dynamic metrics isolated per source", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("catalog-source", () => ({ state: "unknown" })),
    ]));

    const groups = planner.plan([
        buildSubscription({ metricKey: "catalog.sensor:one", sourceIds: ["catalog-source"] }),
        buildSubscription({ metricKey: "catalog.sensor:two", sourceIds: ["catalog-source"] }),
    ]);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["catalog.sensor:one"],
        ["catalog.sensor:two"],
    ]);
    assert.deepEqual(groups.map(group => group.groupKind), ["unknownMetric", "unknownMetric"]);
    assert.notEqual(groups[0]?.collectorGroupKey, groups[1]?.collectorGroupKey);
});

test("skips source candidates waiting for descriptor metadata", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({ state: "pendingMetadata" })),
        new FakeSourceClient("node-system", () => ({ state: "owned", pollingGroupId: "cpu" })),
    ]));

    const groups = planner.plan([
        buildSubscription({ metricKey: "cpu.usage_percent" }),
    ]);

    assert.deepEqual(groups.map(group => ({
        sourceId: group.sourceId,
        groupKind: group.groupKind,
        pollingGroupId: group.groupKind === "sourceDeclared" ? group.pollingGroupId : null,
        metricKeys: group.metricKeys,
    })), [{
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        pollingGroupId: "cpu",
        metricKeys: ["cpu.usage_percent"],
    }]);
});

test("skips unsupported source candidates", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({ state: "unsupported" })),
        new FakeSourceClient("node-system", () => ({ state: "owned", pollingGroupId: "disk" })),
    ]));

    const groups = planner.plan([
        buildSubscription({ metricKey: "disk.usage.percent" }),
    ]);

    assert.deepEqual(groups.map(group => ({
        sourceId: group.sourceId,
        groupKind: group.groupKind,
        pollingGroupId: group.groupKind === "sourceDeclared" ? group.pollingGroupId : null,
        metricKeys: group.metricKeys,
    })), [{
        sourceId: "node-system",
        groupKind: "sourceDeclared",
        pollingGroupId: "disk",
        metricKeys: ["disk.usage.percent"],
    }]);
});

test("uses only the primary source candidate in empty failure mode", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({ state: "owned", pollingGroupId: "lhm-snapshot" })),
        new FakeSourceClient("node-system", () => ({ state: "owned", pollingGroupId: "cpu" })),
    ]));

    const groups = planner.plan([
        buildSubscription({
            metricKey: "cpu.usage_percent",
            failureMode: "empty",
        }),
    ]);

    assert.deepEqual(groups.map(group => group.sourceId), ["windows-helper"]);
});

test("isolates metrics for missing source candidates", () => {
    const planner = new CollectorGroupPlanner(new FakeSourceRegistry([]));

    const groups = planner.plan([
        buildSubscription({ metricKey: "cpu.model", sourceIds: ["missing-source"] }),
        buildSubscription({ metricKey: "cpu.usage_percent", sourceIds: ["missing-source"] }),
    ]);

    assert.deepEqual(groups.map(group => ({
        sourceId: group.sourceId,
        groupKind: group.groupKind,
        isolatedMetricKey: group.groupKind === "unknownMetric" ? group.isolatedMetricKey : null,
        metricKeys: group.metricKeys,
    })), [
        {
            sourceId: "missing-source",
            groupKind: "unknownMetric",
            isolatedMetricKey: "cpu.model",
            metricKeys: ["cpu.model"],
        },
        {
            sourceId: "missing-source",
            groupKind: "unknownMetric",
            isolatedMetricKey: "cpu.usage_percent",
            metricKeys: ["cpu.usage_percent"],
        },
    ]);
});

class FakeSourceClient implements SourceClient {
    constructor(
        readonly sourceId: string,
        private readonly resolveMetricKey: (metricKey: string) => SourceMetricPollingGroupResolution,
    ) {}

    async readSnapshot(): Promise<MetricSnapshot> {
        throw new Error("FakeSourceClient does not serve snapshots.");
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [metricKey, this.resolveMetricKey(metricKey)]));
    }
}

class FakeSourceRegistry implements SourceRegistry {
    private readonly sourceClientsById = new Map<string, SourceClient>();

    constructor(sourceClients: readonly SourceClient[]) {
        for (const sourceClient of sourceClients) {
            this.sourceClientsById.set(sourceClient.sourceId, sourceClient);
        }
    }

    resolveSourceClient(sourceId: string): SourceClient | undefined {
        return this.sourceClientsById.get(sourceId);
    }

    subscribeSourceMetadataInvalidations(): () => void {
        return () => undefined;
    }

    dispose(): void {
        return;
    }
}

function buildSubscription(options: {
    readonly subscriberId?: string;
    readonly metricKey: string;
    readonly sourceScopeId?: string;
    readonly sourceIds?: readonly string[];
    readonly failureMode?: MetricSubscription["failureMode"];
    readonly intervalMilliseconds?: number;
}): MetricSubscription {
    return {
        subscriberId: options.subscriberId ?? "action-1",
        metricKey: options.metricKey,
        sourceScopeId: options.sourceScopeId ?? "local",
        sourceCandidates: (options.sourceIds ?? ["windows-helper", "node-system"])
            .map(sourceId => ({ sourceId })),
        failureMode: options.failureMode ?? "fallback",
        intervalMilliseconds: options.intervalMilliseconds ?? 1000,
    };
}

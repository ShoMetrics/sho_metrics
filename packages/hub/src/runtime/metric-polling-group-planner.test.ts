import assert from "node:assert/strict";
import test from "node:test";
import { planMetricPollingGroups } from "./metric-polling-group-planner";
import type { MetricReadPlan } from "./sources/metric-read-plan";
import type { MetricSnapshot } from "./sources/metric-source";
import type { SourceClient } from "./sources/source-client";
import type { SourceMetricPollingGroupResolution } from "./sources/source-polling-groups";
import type { SourceRegistry } from "./sources/source-registry";

test("planner splits metrics when fallback source groups differ", () => {
    const sourceRegistry = new FakeSourceRegistry([
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
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["cpu.usage_percent", "gpu.temp"],
        sourceIds: ["windows-helper", "node-system"],
        failureMode: "fallback",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["cpu.usage_percent"],
        ["gpu.temp"],
    ]);
});

test("planner coalesces metrics when all source candidate group signatures match", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeSourceClient("node-system", metricKey => {
            if (metricKey === "net.down" || metricKey === "net.up") {
                return { state: "owned", pollingGroupId: "network-traffic" };
            }

            return { state: "unknown" };
        }),
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["net.down", "net.up"],
        sourceIds: ["node-system"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["net.down", "net.up"],
    ]);
});

test("planner keeps unknown metric ids isolated but still eligible for reads", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeSourceClient("catalog-source", () => ({ state: "unknown" })),
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["catalog.sensor:one", "catalog.sensor:two"],
        sourceIds: ["catalog-source"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["catalog.sensor:one"],
        ["catalog.sensor:two"],
    ]);
});

test("planner scopes custom source isolation by profile-backed source id", () => {
    const weatherSource = new FakeSourceClient("source-profile:weather", () => ({
        state: "owned",
        pollingGroupId: "http-json-response",
    }));
    const stocksSource = new FakeSourceClient("source-profile:stocks", () => ({
        state: "owned",
        pollingGroupId: "http-json-response",
    }));
    const sourceRegistry = new FakeSourceRegistry([weatherSource, stocksSource]);

    const weatherGroups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["catalog.weather.temperature"],
        sourceIds: ["source-profile:weather"],
        failureMode: "empty",
    }), sourceRegistry);
    const stockGroups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["catalog.stock.price"],
        sourceIds: ["source-profile:stocks"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.notEqual(weatherGroups[0]?.id, stockGroups[0]?.id);
});

test("planner exposes unsupported source capability state in group signatures", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({ state: "unsupported" })),
        new FakeSourceClient("node-system", () => ({ state: "owned", pollingGroupId: "disk" })),
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["disk.usage.percent", "disk.usage.used"],
        sourceIds: ["windows-helper", "node-system"],
        failureMode: "fallback",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["disk.usage.percent", "disk.usage.used"],
    ]);
    assert.match(groups[0]?.id ?? "", /windows-helper:unsupported/u);
});

test("planner coalesces unsupported metrics for one source candidate", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({ state: "unsupported" })),
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["disk.usage.percent", "disk.usage.used"],
        sourceIds: ["windows-helper"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["disk.usage.percent", "disk.usage.used"],
    ]);
    assert.match(groups[0]?.id ?? "", /windows-helper:unsupported/u);
});

test("planner keeps no-source plans isolated with normal group id shape", () => {
    const sourceRegistry = new FakeSourceRegistry([]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["catalog.sensor:one", "catalog.sensor:two"],
        sourceIds: [],
        failureMode: "empty",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["catalog.sensor:one"],
        ["catalog.sensor:two"],
    ]);
    assert.equal(groups[0]?.id, JSON.stringify(["no-source:unknown:catalog.sensor:one"]));
});

test("planner repartitions when source candidates change", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeSourceClient("windows-helper", () => ({
            state: "owned",
            pollingGroupId: "lhm-snapshot",
        })),
        new FakeSourceClient("node-system", () => ({
            state: "owned",
            pollingGroupId: "cpu",
        })),
    ]);

    const withHelperGroups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["cpu.usage_percent"],
        sourceIds: ["windows-helper", "node-system"],
        failureMode: "fallback",
    }), sourceRegistry);
    const nodeOnlyGroups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["cpu.usage_percent"],
        sourceIds: ["node-system"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.notEqual(withHelperGroups[0]?.id, nodeOnlyGroups[0]?.id);
});

test("planner uses the static bridge for sources without declared groups", () => {
    const sourceRegistry = new FakeSourceRegistry([
        new FakeLegacySourceClient("legacy-source"),
    ]);

    const groups = planMetricPollingGroups(buildReadPlan({
        metricKeys: ["cpu.model", "cpu.usage_percent", "net.down"],
        sourceIds: ["legacy-source"],
        failureMode: "empty",
    }), sourceRegistry);

    assert.deepEqual(groups.map(group => group.metricKeys), [
        ["cpu.model", "cpu.usage_percent"],
        ["net.down"],
    ]);
});

class FakeSourceClient implements SourceClient {
    constructor(
        readonly sourceId: string,
        private readonly resolveMetricKey?: (metricKey: string) => SourceMetricPollingGroupResolution,
    ) {}

    async readSnapshot(): Promise<MetricSnapshot> {
        throw new Error("FakeSourceClient does not serve snapshots.");
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [metricKey, this.resolveMetricKey?.(metricKey) ?? {
            state: "unknown",
        }]));
    }
}

class FakeLegacySourceClient implements SourceClient {
    constructor(readonly sourceId: string) {}

    async readSnapshot(): Promise<MetricSnapshot> {
        throw new Error("FakeLegacySourceClient does not serve snapshots.");
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

    dispose(): void {
        return;
    }
}

function buildReadPlan(options: {
    metricKeys: readonly string[];
    sourceIds: readonly string[];
    failureMode: MetricReadPlan["failureMode"];
}): MetricReadPlan {
    return {
        sourceScopeId: "local",
        metricKeys: options.metricKeys,
        sourceCandidates: options.sourceIds.map(sourceId => ({ sourceId })),
        failureMode: options.failureMode,
    };
}

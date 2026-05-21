import assert from "node:assert/strict";
import test from "node:test";
import type { SourceClient } from "../sources/source-client";
import type { SourceRegistry } from "../sources/source-registry";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import { BackoffPolicy } from "../sources/backoff-policy";
import { BackgroundMetricCollection } from "./background-metric-collection";
import { CollectorGroupPlanner } from "./collector-group-planner";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import { MetricSubscriptionRegistry } from "./metric-subscription-registry";
import { SourcePlanningMetadataRegistry } from "./source-planning-metadata-registry";

test("source metadata invalidation increments planning version only when fingerprint changes", () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const collection = buildBackgroundMetricCollection(subscriptionRegistry);

    assert.equal(subscriptionRegistry.planningVersion, 0);
    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    }), true);
    assert.equal(subscriptionRegistry.planningVersion, 1);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorChanged",
    }), false);
    assert.equal(subscriptionRegistry.planningVersion, 1);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-2",
        reason: "capabilityChanged",
    }), true);
    assert.equal(subscriptionRegistry.planningVersion, 2);
});

test("changed source metadata re-plans current subscriptions", () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const sourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId: "system",
    }));
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [sourceClient],
    });

    const unregister = collection.registerSubscriptions({
        subscriberId: "action-1",
        subscriptions: [
            {
                subscriberId: "action-1",
                metricKey: "cpu.usage_percent",
                sourceScopeId: "local",
                sourceCandidates: [{ sourceId: "node-system" }],
                failureMode: "fallback",
                intervalMilliseconds: 1000,
            },
            {
                subscriberId: "action-1",
                metricKey: "ram.used_bytes",
                sourceScopeId: "local",
                sourceCandidates: [{ sourceId: "node-system" }],
                failureMode: "fallback",
                intervalMilliseconds: 1000,
            },
        ],
    });

    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 1);
    assert.deepEqual(sourceClient.latestResolvedMetricKeys, ["cpu.usage_percent", "ram.used_bytes"]);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    }), true);
    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 2);
    assert.deepEqual(sourceClient.latestResolvedMetricKeys, ["cpu.usage_percent", "ram.used_bytes"]);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorChanged",
    }), false);
    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 2);

    unregister();
});

function buildBackgroundMetricCollection(
    subscriptionRegistry: MetricSubscriptionRegistry,
    options: {
        readonly sourceClients?: readonly SourceClient[];
    } = {},
): BackgroundMetricCollection {
    const sourceRegistry = new FakeSourceRegistry(options.sourceClients ?? []);
    const timer = new FakeTimer();

    return new BackgroundMetricCollection({
        subscriptionRegistry,
        collectorGroupPlanner: new CollectorGroupPlanner(sourceRegistry),
        collectorGroupSupervisor: new CollectorGroupSupervisor({
            sourceRegistry,
            snapshotStore: { ingest: () => undefined },
            createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
            timer,
        }),
        sourceMetadataRegistry: new SourcePlanningMetadataRegistry(),
        sourceRegistry,
    });
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
        // Nothing to dispose in tests.
    }
}

class FakeSourceClient implements SourceClient {
    resolveMetricPollingGroupsCallCount = 0;
    latestResolvedMetricKeys: readonly string[] = [];

    constructor(
        readonly sourceId: string,
        private readonly resolveMetricKey: (metricKey: string) => SourceMetricPollingGroupResolution,
    ) {}

    async readSnapshot(): Promise<never> {
        throw new Error("FakeSourceClient does not serve snapshots.");
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        this.resolveMetricPollingGroupsCallCount += 1;
        this.latestResolvedMetricKeys = metricKeys;

        return new Map(metricKeys.map(metricKey => [metricKey, this.resolveMetricKey(metricKey)]));
    }
}

class FakeTimer {
    set(): unknown {
        return {};
    }

    clear(): void {
        // Nothing to clear in tests.
    }
}

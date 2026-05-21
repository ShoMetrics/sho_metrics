import assert from "node:assert/strict";
import test from "node:test";
import type { SourceClient } from "../sources/source-client";
import type { SourceRegistry } from "../sources/source-registry";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import type { SourceMetadataInvalidation, SourceMetadataInvalidationListener } from "../sources/source-planning-metadata";
import { BackoffPolicy } from "../sources/backoff-policy";
import { BackgroundMetricCollection } from "./background-metric-collection";
import { CollectorGroupPlanner } from "./collector-group-planner";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import { MetricSubscriptionRegistry } from "./metric-subscription-registry";
import { SourcePlanningMetadataRegistry } from "./source-planning-metadata-registry";

type BuildBackgroundMetricCollectionOptions =
    (
        | { readonly sourceClients: readonly SourceClient[]; readonly sourceRegistry?: never }
        | { readonly sourceRegistry: FakeSourceRegistry; readonly sourceClients?: never }
    ) & {
        readonly timer?: FakeTimer;
    };

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

test("source registry metadata hook re-plans current subscriptions", () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const sourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId: "system",
    }));
    const sourceRegistry = new FakeSourceRegistry([sourceClient]);
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceRegistry,
    });

    collection.registerSubscriptions({
        subscriberId: "action-1",
        subscriptions: [{
            subscriberId: "action-1",
            metricKey: "cpu.usage_percent",
            sourceScopeId: "local",
            sourceCandidates: [{ sourceId: "node-system" }],
            failureMode: "fallback",
            intervalMilliseconds: 1000,
        }],
    });

    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 1);

    sourceRegistry.emitSourceMetadataInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    });

    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 2);

    collection.dispose();
    sourceRegistry.emitSourceMetadataInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-2",
        reason: "descriptorChanged",
    });

    assert.equal(sourceClient.resolveMetricPollingGroupsCallCount, 2);
});

test("same source metadata fingerprint does not restart collector groups", () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const timer = new FakeTimer();
    const sourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId: "system",
    }));
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [sourceClient],
        timer,
    });

    collection.registerSubscriptions({
        subscriberId: "action-1",
        subscriptions: [{
            subscriberId: "action-1",
            metricKey: "cpu.usage_percent",
            sourceScopeId: "local",
            sourceCandidates: [{ sourceId: "node-system" }],
            failureMode: "fallback",
            intervalMilliseconds: 1000,
        }],
    });
    assert.deepEqual(timer.recordedDelaysMilliseconds, [0]);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    }), true);
    assert.deepEqual(timer.recordedDelaysMilliseconds, [0]);

    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorChanged",
    }), false);
    assert.deepEqual(timer.recordedDelaysMilliseconds, [0]);
});

test("changed source profile planning fingerprint restarts changed collector groups", () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const timer = new FakeTimer();
    let pollingGroupId = "system-v1";
    const sourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId,
    }));
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [sourceClient],
        timer,
    });

    collection.registerSubscriptions({
        subscriberId: "action-1",
        subscriptions: [{
            subscriberId: "action-1",
            metricKey: "cpu.usage_percent",
            sourceScopeId: "local",
            sourceCandidates: [{ sourceId: "node-system" }],
            failureMode: "fallback",
            intervalMilliseconds: 1000,
        }],
    });

    pollingGroupId = "system-v2";
    assert.equal(collection.notifySourceMetadataChanged({
        sourceScopeId: "local",
        sourceProfileId: "node-system",
        planningFingerprint: "profile-fingerprint-v2",
        reason: "sourceProfileChanged",
    }), true);

    assert.deepEqual(timer.recordedDelaysMilliseconds, [0, 0]);
});

function buildBackgroundMetricCollection(
    subscriptionRegistry: MetricSubscriptionRegistry,
    options?: BuildBackgroundMetricCollectionOptions,
): BackgroundMetricCollection {
    const sourceRegistry = options?.sourceRegistry ?? new FakeSourceRegistry(options?.sourceClients ?? []);
    const timer = options?.timer ?? new FakeTimer();

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
    private readonly sourceMetadataInvalidationListeners = new Set<SourceMetadataInvalidationListener>();

    constructor(sourceClients: readonly SourceClient[]) {
        for (const sourceClient of sourceClients) {
            this.sourceClientsById.set(sourceClient.sourceId, sourceClient);
        }
    }

    resolveSourceClient(sourceId: string): SourceClient | undefined {
        return this.sourceClientsById.get(sourceId);
    }

    subscribeSourceMetadataInvalidations(listener: SourceMetadataInvalidationListener): () => void {
        this.sourceMetadataInvalidationListeners.add(listener);

        return () => {
            this.sourceMetadataInvalidationListeners.delete(listener);
        };
    }

    emitSourceMetadataInvalidation(invalidation: SourceMetadataInvalidation): void {
        for (const listener of this.sourceMetadataInvalidationListeners) {
            listener(invalidation);
        }
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
    readonly recordedDelaysMilliseconds: number[] = [];

    set(callback: () => void, delayMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
        };
        this.recordedDelaysMilliseconds.push(delayMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as FakeTimerHandle).active = false;
    }
}

interface FakeTimerHandle {
    active: boolean;
    callback(): void;
}

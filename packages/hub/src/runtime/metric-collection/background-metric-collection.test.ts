import assert from "node:assert/strict";
import test from "node:test";
import type {
    MetricDescriptorSnapshot,
    SourceClient,
    SourceRefreshDemandGroup,
    SourceSnapshotReadResult,
} from "../sources/source-client";
import type { SourceRegistry } from "../sources/source-registry";
import type { SourceMetricPollingGroupResolution } from "../sources/source-polling-groups";
import type { SourceMetadataInvalidation, SourceMetadataInvalidationListener } from "../sources/source-planning-metadata";
import { buildMetricSnapshot, buildScalarMetricValue } from "../sources/metric-source";
import { WINDOWS_HELPER_SOURCE_ID } from "../sources/source-ids";
import { BackoffPolicy } from "../sources/backoff-policy";
import { BackgroundMetricCollection } from "./background-metric-collection";
import { CollectorGroupPlanner } from "./collector-group-planner";
import { CollectorGroupSupervisor } from "./collector-group-supervisor";
import {
    MetricStoreIngestDiagnostics,
    type MetricStoreInvalidValuesLogEntry,
} from "./metric-store-ingest-diagnostics";
import { MetricSubscriptionRegistry } from "./metric-subscription-registry";
import { SourcePlanningMetadataRegistry } from "./source-planning-metadata-registry";

// register/unregister fire-and-forget refresh-demand sends; ten turns matches
// the deeper supervisor tests and leaves margin for the promise/finally chain.
const ASYNC_TIMER_DRAIN_MICROTASK_TICKS = 10;

type BuildBackgroundMetricCollectionOptions =
    (
        | { readonly sourceClients: readonly SourceClient[]; readonly sourceRegistry?: never }
        | { readonly sourceRegistry: FakeSourceRegistry; readonly sourceClients?: never }
    ) & {
        readonly timer?: FakeTimer;
        readonly metricStoreIngestDiagnostics?: MetricStoreIngestDiagnostics;
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

test("unregistering helper subscriptions clears refresh demand and cancels renewal", async () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const timer = new FakeTimer();
    const windowsHelperSourceClient = new FakeSourceClient(WINDOWS_HELPER_SOURCE_ID, () => ({
        state: "owned",
        pollingGroupId: "lhm:hardware:cpu",
    }), { servesSnapshots: true });
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [windowsHelperSourceClient],
        timer,
    });

    const unregister = collection.registerSubscriptions({
        subscriberId: "action-1",
        subscriptions: [{
            subscriberId: "action-1",
            metricKey: "cpu.temperature",
            sourceScopeId: "local",
            sourceCandidates: [{ sourceId: WINDOWS_HELPER_SOURCE_ID }],
            failureMode: "fallback",
            intervalMilliseconds: 1000,
        }],
    });
    await timer.drainMicrotasks();

    assert.deepEqual(windowsHelperSourceClient.refreshDemandGroups, [[{
        pollingGroupId: "lhm:hardware:cpu",
        metricKeys: ["cpu.temperature"],
        intervalMilliseconds: 1000,
    }]]);
    // One runner poll timer plus one helper demand renewal timer should be live.
    assert.equal(timer.activeHandleCount(), 2);

    unregister();
    await timer.drainMicrotasks();

    assert.deepEqual(windowsHelperSourceClient.refreshDemandGroups.at(-1), []);
    assert.equal(timer.activeHandleCount(), 0);
});

test("refreshReadPlanOnce requests only each source candidate's routed metric keys", async () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const windowsHelperSourceClient = new FakeSourceClient("windows-helper", () => ({
        state: "owned",
        pollingGroupId: "helper",
    }), { servesSnapshots: true });
    const nodeSystemSourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId: "system",
    }), { servesSnapshots: true });
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [windowsHelperSourceClient, nodeSystemSourceClient],
    });

    await collection.refreshReadPlanOnce({
        metrics: [
            {
                sourceScopeId: "local",
                metricKey: "cpu.usage_percent",
                sourceCandidates: [{ sourceId: "node-system" }],
                failureMode: "empty",
            },
            {
                sourceScopeId: "local",
                metricKey: "gpu.temp",
                sourceCandidates: [
                    { sourceId: "windows-helper" },
                    { sourceId: "node-system" },
                ],
                failureMode: "fallback",
            },
            {
                sourceScopeId: "local",
                metricKey: "ram.used",
                sourceCandidates: [
                    { sourceId: "windows-helper" },
                    { sourceId: "node-system" },
                ],
                failureMode: "empty",
            },
        ],
    });

    assert.deepEqual(windowsHelperSourceClient.latestReadMetricKeys, ["gpu.temp", "ram.used"]);
    assert.equal(windowsHelperSourceClient.readSnapshotCallCount, 1);
    assert.deepEqual(nodeSystemSourceClient.latestReadMetricKeys, ["cpu.usage_percent", "gpu.temp"]);
    assert.equal(nodeSystemSourceClient.readSnapshotCallCount, 1);
});

test("refreshReadPlanOnce reports invalid values dropped by MetricStore ingest", async () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const diagnosticsLogWriter = new RecordingMetricStoreIngestDiagnosticsLogWriter();
    const nodeSystemSourceClient = new FakeSourceClient("node-system", () => ({
        state: "owned",
        pollingGroupId: "system",
    }), {
        snapshotReadResult: {
            snapshot: buildMetricSnapshot({
                timestampMilliseconds: 1000,
                metrics: {
                    "cpu.usage_percent": buildScalarMetricValue(Number.NaN),
                },
            }),
            valueMetadata: [],
            unavailableMetrics: [],
        },
    });
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [nodeSystemSourceClient],
        metricStoreIngestDiagnostics: new MetricStoreIngestDiagnostics({
            logWriter: diagnosticsLogWriter,
            throttleMilliseconds: 60_000,
        }),
    });

    await collection.refreshReadPlanOnce({
        metrics: [{
            sourceScopeId: "local",
            metricKey: "cpu.usage_percent",
            sourceCandidates: [{ sourceId: "node-system" }],
            failureMode: "empty",
        }],
    });

    assert.deepEqual(diagnosticsLogWriter.entries.map(entry => ({
        sourceId: entry.sourceId,
        sourceScopeId: entry.sourceScopeId,
        groupKind: entry.groupKind,
        groupId: entry.groupId,
        rejectedCount: entry.rejectedCount,
        uniqueMetricCount: entry.uniqueMetricCount,
        intervalMilliseconds: entry.intervalMilliseconds,
    })), [{
        sourceId: "node-system",
        sourceScopeId: undefined,
        groupKind: "runtimeOptionRefresh",
        groupId: "manual",
        rejectedCount: 1,
        uniqueMetricCount: 1,
        intervalMilliseconds: undefined,
    }]);
});

test("readSourceMetricDescriptors does not register collection or read snapshots", async () => {
    const subscriptionRegistry = new MetricSubscriptionRegistry();
    const descriptorSnapshot = {
        descriptors: [],
        descriptorFingerprint: "catalog-fingerprint",
    };
    const windowsHelperSourceClient = new FakeSourceClient("windows-helper", () => ({
        state: "owned",
        pollingGroupId: "helper",
    }), {
        descriptorSnapshot,
    });
    const timer = new FakeTimer();
    const collection = buildBackgroundMetricCollection(subscriptionRegistry, {
        sourceClients: [windowsHelperSourceClient],
        timer,
    });

    const result = await collection.readSourceMetricDescriptors("windows-helper");

    assert.equal(result, descriptorSnapshot);
    assert.equal(windowsHelperSourceClient.listMetricDescriptorsCallCount, 1);
    assert.deepEqual(windowsHelperSourceClient.latestDescriptorMetricKeys, []);
    assert.equal(windowsHelperSourceClient.readSnapshotCallCount, 0);
    assert.deepEqual(subscriptionRegistry.listSubscriptions(), []);
    assert.deepEqual(timer.recordedDelaysMilliseconds, []);
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
            snapshotStore: { ingest: () => emptyMetricStoreIngestReport() },
            createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
            timer,
        }),
        sourceMetadataRegistry: new SourcePlanningMetadataRegistry(),
        sourceRegistry,
        metricStoreIngestDiagnostics: options?.metricStoreIngestDiagnostics,
    });
}

function emptyMetricStoreIngestReport() {
    return {
        acceptedScalarCount: 0,
        acceptedTextCount: 0,
        rejectedCount: 0,
        rejections: [],
    };
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

    readCachedSourceStatus(): undefined {
        return undefined;
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
    readSnapshotCallCount = 0;
    latestReadMetricKeys: readonly string[] = [];
    listMetricDescriptorsCallCount = 0;
    latestDescriptorMetricKeys: readonly string[] = [];
    readonly refreshDemandGroups: SourceRefreshDemandGroup[][] = [];

    constructor(
        readonly sourceId: string,
        private readonly resolveMetricKey: (metricKey: string) => SourceMetricPollingGroupResolution,
        private readonly options: {
            readonly servesSnapshots?: boolean;
            readonly snapshotReadResult?: SourceSnapshotReadResult;
            readonly descriptorSnapshot?: MetricDescriptorSnapshot;
        } = {},
    ) {}

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        if (this.options.servesSnapshots !== true && this.options.snapshotReadResult === undefined) {
            throw new Error("FakeSourceClient does not serve snapshots.");
        }

        this.readSnapshotCallCount += 1;
        this.latestReadMetricKeys = metricKeys;

        return this.options.snapshotReadResult ?? {
            snapshot: buildMetricSnapshot({
                timestampMilliseconds: 1000,
                metrics: {},
            }),
            valueMetadata: [],
            unavailableMetrics: [],
        };
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        this.resolveMetricPollingGroupsCallCount += 1;
        this.latestResolvedMetricKeys = metricKeys;

        return new Map(metricKeys.map(metricKey => [metricKey, this.resolveMetricKey(metricKey)]));
    }

    async listMetricDescriptors(metricKeys: readonly string[]): Promise<MetricDescriptorSnapshot> {
        if (this.options.descriptorSnapshot === undefined) {
            throw new Error("FakeSourceClient does not serve descriptors.");
        }

        this.listMetricDescriptorsCallCount += 1;
        this.latestDescriptorMetricKeys = metricKeys;

        return this.options.descriptorSnapshot;
    }

    async setMetricRefreshDemand(groups: readonly SourceRefreshDemandGroup[]): Promise<void> {
        this.refreshDemandGroups.push(groups.map(group => ({
            pollingGroupId: group.pollingGroupId,
            metricKeys: [...group.metricKeys],
            intervalMilliseconds: group.intervalMilliseconds,
        })));
    }
}

class RecordingMetricStoreIngestDiagnosticsLogWriter {
    readonly entries: MetricStoreInvalidValuesLogEntry[] = [];

    write(entry: MetricStoreInvalidValuesLogEntry): void {
        this.entries.push(entry);
    }
}

class FakeTimer {
    readonly recordedDelaysMilliseconds: number[] = [];
    private readonly handles: FakeTimerHandle[] = [];

    set(callback: () => void, delayMilliseconds: number): unknown {
        const handle = {
            active: true,
            callback,
        };
        this.handles.push(handle);
        this.recordedDelaysMilliseconds.push(delayMilliseconds);
        return handle;
    }

    clear(handle: unknown): void {
        (handle as FakeTimerHandle).active = false;
    }

    activeHandleCount(): number {
        return this.handles.filter(handle => handle.active).length;
    }

    async drainMicrotasks(): Promise<void> {
        for (let tick = 0; tick < ASYNC_TIMER_DRAIN_MICROTASK_TICKS; tick += 1) {
            await Promise.resolve();
        }
    }
}

interface FakeTimerHandle {
    active: boolean;
    callback(): void;
}

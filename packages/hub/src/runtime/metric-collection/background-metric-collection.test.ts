import assert from "node:assert/strict";
import test from "node:test";
import type { SourceClient } from "../sources/source-client";
import type { SourceRegistry } from "../sources/source-registry";
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

function buildBackgroundMetricCollection(
    subscriptionRegistry: MetricSubscriptionRegistry,
): BackgroundMetricCollection {
    const sourceRegistry = new FakeSourceRegistry();

    return new BackgroundMetricCollection({
        subscriptionRegistry,
        collectorGroupPlanner: new CollectorGroupPlanner(sourceRegistry),
        collectorGroupSupervisor: new CollectorGroupSupervisor({
            sourceRegistry,
            snapshotStore: { ingest: () => undefined },
            createBackoffPolicy: () => BackoffPolicy.flat(() => 0, 1000),
        }),
        sourceMetadataRegistry: new SourcePlanningMetadataRegistry(),
        sourceRegistry,
    });
}

class FakeSourceRegistry implements SourceRegistry {
    resolveSourceClient(): SourceClient | undefined {
        return undefined;
    }

    dispose(): void {
        // Nothing to dispose in tests.
    }
}

import assert from "node:assert/strict";
import test from "node:test";
import type { SourceClient, SourceSnapshotReadResult } from "./source-client";
import type { SourceMetadataInvalidation, SourceMetadataInvalidationListener } from "./source-planning-metadata";
import type { SourceMetricPollingGroupResolution } from "./source-polling-groups";
import { createDefaultSourceRegistry, DefaultSourceRegistry } from "./source-registry";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "./source-ids";

test("default source registry registers the Windows helper before fallback on Windows", () => {
    const sourceRegistry = createDefaultSourceRegistry({ platform: "win32" });

    try {
        assert.equal(
            sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID)?.sourceId,
            WINDOWS_HELPER_SOURCE_ID,
        );
        assert.equal(
            sourceRegistry.resolveSourceClient(NODE_SYSTEM_SOURCE_ID)?.sourceId,
            NODE_SYSTEM_SOURCE_ID,
        );
    } finally {
        sourceRegistry.dispose();
    }
});

test("default source registry excludes the Windows helper outside Windows", () => {
    const sourceRegistry = createDefaultSourceRegistry({ platform: "darwin" });

    try {
        assert.equal(sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID), undefined);
        assert.equal(
            sourceRegistry.resolveSourceClient(NODE_SYSTEM_SOURCE_ID)?.sourceId,
            NODE_SYSTEM_SOURCE_ID,
        );
    } finally {
        sourceRegistry.dispose();
    }
});

test("default source registry forwards source metadata invalidations", () => {
    const sourceClient = new FakeSourceClient("metadata-source");
    const sourceRegistry = new DefaultSourceRegistry([sourceClient]);
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = sourceRegistry.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });

    sourceClient.emitSourceMetadataInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "metadata-source",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    });
    unsubscribe();
    sourceClient.emitSourceMetadataInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "metadata-source",
        planningFingerprint: "fingerprint-2",
        reason: "descriptorChanged",
    });

    assert.deepEqual(invalidations, [{
        sourceScopeId: "local",
        sourceProfileId: "metadata-source",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    }]);
});

class FakeSourceClient implements SourceClient {
    private readonly sourceMetadataInvalidationListeners = new Set<SourceMetadataInvalidationListener>();

    constructor(readonly sourceId: string) {}

    async readSnapshot(): Promise<SourceSnapshotReadResult> {
        throw new Error("FakeSourceClient does not serve snapshots.");
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [metricKey, { state: "unknown" }]));
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
}

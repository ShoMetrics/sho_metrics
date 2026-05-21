import assert from "node:assert/strict";
import test from "node:test";
import { SourcePlanningMetadataRegistry } from "./source-planning-metadata-registry";

test("accepts first planning fingerprint and ignores same fingerprint reconnect", () => {
    const registry = new SourcePlanningMetadataRegistry();

    assert.equal(registry.recordInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    }), true);
    assert.equal(registry.recordInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorChanged",
    }), false);
    assert.equal(registry.getPlanningFingerprint({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
    }), "fingerprint-1");
});

test("accepts changed planning fingerprint for the same source", () => {
    const registry = new SourcePlanningMetadataRegistry();

    registry.recordInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-1",
        reason: "descriptorLoaded",
    });

    assert.equal(registry.recordInvalidation({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
        planningFingerprint: "fingerprint-2",
        reason: "capabilityChanged",
    }), true);
    assert.equal(registry.getPlanningFingerprint({
        sourceScopeId: "local",
        sourceProfileId: "windows-helper",
    }), "fingerprint-2");
});

test("tracks source scopes independently", () => {
    const registry = new SourcePlanningMetadataRegistry();

    registry.recordInvalidation({
        sourceScopeId: "profile:a",
        sourceProfileId: "http-json",
        planningFingerprint: "fingerprint-a",
        reason: "sourceProfileChanged",
    });
    registry.recordInvalidation({
        sourceScopeId: "profile:b",
        sourceProfileId: "http-json",
        planningFingerprint: "fingerprint-b",
        reason: "sourceProfileChanged",
    });

    assert.equal(registry.getPlanningFingerprint({
        sourceScopeId: "profile:a",
        sourceProfileId: "http-json",
    }), "fingerprint-a");
    assert.equal(registry.getPlanningFingerprint({
        sourceScopeId: "profile:b",
        sourceProfileId: "http-json",
    }), "fingerprint-b");
});

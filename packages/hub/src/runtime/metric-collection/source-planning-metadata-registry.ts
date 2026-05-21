/** Describes why a source published complete planning metadata. */
export type SourceMetadataInvalidationReason =
    /** Descriptors became available after startup or reconnect. */
    | "descriptorLoaded"
    /** Descriptor contents changed, such as hardware hotplug or a refreshed catalog. */
    | "descriptorChanged"
    /** Owned/unsupported/unknown capability metadata changed. */
    | "capabilityChanged"
    /** Profile content changed while the profile id stayed the same. */
    | "sourceProfileChanged";

export interface SourceMetadataInvalidation {
    readonly sourceScopeId: string;
    readonly sourceProfileId: string;
    /**
     * Opaque source-owned content fingerprint for all metadata that can affect
     * collector planning.
     *
     * The hub compares this string for equality only. Sources commonly use a
     * stable content hash, for example `sha256:4f1c...`, but the exact format is
     * source-owned and must not be parsed by the registry.
     */
    readonly planningFingerprint: string;
    readonly reason: SourceMetadataInvalidationReason;
}

/**
 * Stores source-owned planning metadata fingerprints.
 *
 * This registry is deliberately narrow: it decides whether a source metadata
 * invalidation changes collector planning assumptions. It does not inspect
 * descriptors, read source health, start runners, or render widgets.
 */
export class SourcePlanningMetadataRegistry {
    // Outer key: sourceScopeId. Inner key: sourceProfileId. Value: latest planningFingerprint.
    private readonly planningFingerprintsBySourceScope = new Map<string, Map<string, string>>();

    /**
     * Records one complete planning metadata invalidation.
     *
     * Source clients call this after descriptor, capability, or planning-relevant
     * profile metadata has finished loading. The metadata snapshot must be
     * complete before this method is called; partial descriptor traversal states
     * should not trigger collector re-planning.
     *
     * Returns whether the source's planning fingerprint changed. Same
     * fingerprint reconnects are idempotent and should not trigger runner
     * reconciliation.
     */
    recordInvalidation(invalidation: SourceMetadataInvalidation): boolean {
        const previousPlanningFingerprint = this.planningFingerprintsBySourceScope
            .get(invalidation.sourceScopeId)
            ?.get(invalidation.sourceProfileId);

        if (previousPlanningFingerprint === invalidation.planningFingerprint) {
            return false;
        }

        this.sourceProfileFingerprintsFor(invalidation.sourceScopeId)
            .set(invalidation.sourceProfileId, invalidation.planningFingerprint);

        return true;
    }

    /** @internal Returns the stored fingerprint for diagnostics and tests. */
    getPlanningFingerprint(options: {
        readonly sourceScopeId: string;
        readonly sourceProfileId: string;
    }): string | undefined {
        return this.planningFingerprintsBySourceScope
            .get(options.sourceScopeId)
            ?.get(options.sourceProfileId);
    }

    private sourceProfileFingerprintsFor(sourceScopeId: string): Map<string, string> {
        const existingSourceProfileFingerprints = this.planningFingerprintsBySourceScope.get(sourceScopeId);

        if (existingSourceProfileFingerprints) {
            return existingSourceProfileFingerprints;
        }

        const sourceProfileFingerprints = new Map<string, string>();
        this.planningFingerprintsBySourceScope.set(sourceScopeId, sourceProfileFingerprints);

        return sourceProfileFingerprints;
    }
}

export const sourcePlanningMetadataRegistry = new SourcePlanningMetadataRegistry();

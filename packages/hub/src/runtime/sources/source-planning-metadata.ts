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

export type SourceMetadataInvalidationListener = (invalidation: SourceMetadataInvalidation) => void;

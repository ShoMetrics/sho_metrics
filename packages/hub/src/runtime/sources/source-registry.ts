import { NodeSystemSource } from "./node-system/node-system-source";
import { createMetricSourceClient, type SourceClient, type SourceClientStatus } from "./source-client";
import { CustomHttpSourceClient } from "./custom-http/custom-http-source-client";
import type { SourceMetadataInvalidationListener } from "./source-planning-metadata";
import { WindowsHelperSourceClient } from "./windows-helper/windows-helper-source-client";
import { VendorHidBatterySourceClient } from "./battery/vendor-hid-battery-source-client";
import { shouldEnableVendorHidBatterySupport } from "../source-capabilities/vendor-hid-battery-platform-capabilities";

/** Options for default source registry creation. */
export interface DefaultSourceRegistryOptions {
    /** Platform used to choose local helper sources. */
    readonly platform?: NodeJS.Platform;
}

/** Lookup boundary for runtime telemetry sources. */
export interface SourceRegistry {
    /** Resolves a source client by registry-owned source id. */
    resolveSourceClient(sourceId: string): SourceClient | undefined;

    /** Reads a source client's cached status without doing source I/O. */
    readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined;

    /** Subscribes to source planning metadata invalidations emitted by registered sources. */
    subscribeSourceMetadataInvalidations(listener: SourceMetadataInvalidationListener): () => void;

    /** Disposes all registered source clients. */
    dispose(): void;
}

/** In-memory source registry used by the plugin runtime. */
export class DefaultSourceRegistry implements SourceRegistry {
    private readonly sourceClientById = new Map<string, SourceClient>();

    constructor(sourceClients: readonly SourceClient[]) {
        for (const sourceClient of sourceClients) {
            if (this.sourceClientById.has(sourceClient.sourceId)) {
                throw new Error(`Duplicate source id: ${sourceClient.sourceId}`);
            }

            this.sourceClientById.set(sourceClient.sourceId, sourceClient);
        }
    }

    resolveSourceClient(sourceId: string): SourceClient | undefined {
        return this.sourceClientById.get(sourceId);
    }

    readCachedSourceStatus(sourceId: string): SourceClientStatus | undefined {
        return this.sourceClientById.get(sourceId)?.getCachedStatus?.();
    }

    subscribeSourceMetadataInvalidations(listener: SourceMetadataInvalidationListener): () => void {
        const unsubscribeCallbacks: Array<() => void> = [];

        for (const sourceClient of this.sourceClientById.values()) {
            const unsubscribe = sourceClient.subscribeSourceMetadataInvalidations?.(listener);

            if (unsubscribe) {
                unsubscribeCallbacks.push(unsubscribe);
            }
        }

        return () => {
            for (const unsubscribe of unsubscribeCallbacks) {
                unsubscribe();
            }
        };
    }

    dispose(): void {
        for (const sourceClient of this.sourceClientById.values()) {
            sourceClient.dispose?.();
        }
    }
}

/** Creates the default local source registry for the Stream Deck plugin process. */
export function createDefaultSourceRegistry(options: DefaultSourceRegistryOptions = {}): SourceRegistry {
    const platform = options.platform ?? process.platform;
    const sourceClients: SourceClient[] = [];

    if (platform === "win32") {
        sourceClients.push(new WindowsHelperSourceClient());
    }

    sourceClients.push(createMetricSourceClient(new NodeSystemSource({ platform })));
    sourceClients.push(new CustomHttpSourceClient());

    if (shouldEnableVendorHidBatterySupport(platform)) {
        sourceClients.push(new VendorHidBatterySourceClient());
    }

    return new DefaultSourceRegistry(sourceClients);
}

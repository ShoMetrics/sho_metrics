import { NodeSystemSource } from "./node-system-source";
import { createMetricSourceClient, type SourceClient } from "./source-client";
import { WindowsHelperSourceClient } from "./windows-helper-source-client";

/** Options for default source registry creation. */
export interface DefaultSourceRegistryOptions {
    /** Platform used to choose local helper sources. */
    readonly platform?: NodeJS.Platform;
}

/** Lookup boundary for runtime telemetry sources. */
export interface SourceRegistry {
    /** Resolves a source client by registry-owned source id. */
    resolveSourceClient(sourceId: string): SourceClient | undefined;

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

    return new DefaultSourceRegistry(sourceClients);
}

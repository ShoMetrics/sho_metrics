import { logger } from "../../logging/node-logger";
import { backgroundMetricCollection } from "../../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../../runtime/sources/source-ids";
import type { MetricDescriptorSnapshot, SourceClientStatus } from "../../runtime/sources/source-client";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";

const log = logger.for("Action:CatalogMetricDescriptors");
const CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS = 30_000;

export interface CatalogMetricDescriptorRuntimeCacheRefreshOptions {
    readonly platform: NodeJS.Platform;
    readonly readCachedSourceStatus: (sourceId: string) => SourceClientStatus | undefined;
    readonly updateRuntimeCache: (patch: WidgetRuntimeCachePatch) => Promise<void>;
    readonly readMetricDescriptorSnapshot?: () => Promise<MetricDescriptorSnapshot>;
}

/** Refreshes helper-owned catalog descriptors for Property Inspector pickers. */
export async function refreshCatalogMetricDescriptorRuntimeCache({
    platform,
    readCachedSourceStatus,
    updateRuntimeCache,
    readMetricDescriptorSnapshot = readWindowsHelperMetricDescriptorSnapshot,
}: CatalogMetricDescriptorRuntimeCacheRefreshOptions): Promise<void> {
    if (platform !== "win32") {
        // Catalog metrics are currently backed only by the Windows helper.
        // Non-Windows profiles can still contain catalog targets after sync or
        // import, so keep the PI responsive without probing a source that
        // cannot exist on this platform.
        await updateRuntimeCache({
            availableCatalogMetricDescriptors: [],
            catalogMetricDescriptorLoadState: "failed",
        });
        return;
    }

    const pendingSourceStatus = readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);
    await updateRuntimeCache({
        catalogMetricDescriptorLoadState: "pending",
        ...(pendingSourceStatus ? { catalogMetricDescriptorSourceStatus: pendingSourceStatus } : {}),
    });

    try {
        const descriptorSnapshot = await readMetricDescriptorSnapshot();
        const sourceStatus = readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);

        log.debug(() => [
            "catalogMetricDescriptorsRefreshed",
            `descriptorCount=${descriptorSnapshot.descriptors.length}`,
            `fingerprint=${descriptorSnapshot.descriptorFingerprint}`,
        ].join(" "));

        await updateRuntimeCache({
            availableCatalogMetricDescriptors: descriptorSnapshot.descriptors,
            catalogMetricDescriptorLoadState: "ready",
            ...(sourceStatus ? { catalogMetricDescriptorSourceStatus: sourceStatus } : {}),
        });
    } catch (error) {
        log.atWarn()
            .everyMs(
                "catalog-metric-descriptors-load-failed",
                CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS,
            )
            .log(() => `Failed to load catalog metric descriptors. error=${String(error)}`);
        const sourceStatus = readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);

        await updateRuntimeCache({
            availableCatalogMetricDescriptors: [],
            catalogMetricDescriptorLoadState: "failed",
            ...(sourceStatus ? { catalogMetricDescriptorSourceStatus: sourceStatus } : {}),
        });
    }
}

function readWindowsHelperMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
    return backgroundMetricCollection.readSourceMetricDescriptors(WINDOWS_HELPER_SOURCE_ID);
}

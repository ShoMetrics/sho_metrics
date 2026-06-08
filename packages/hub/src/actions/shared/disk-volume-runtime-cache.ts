import { diskVolumeRegistry } from "../../runtime/disk-volumes";
import { backgroundMetricCollection } from "../../runtime/metric-collection/background-metric-collection";
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import type { ResolvedMetricSourcePolicy } from "../../settings/resolved-settings";
import { resolveDiskUsageMetricSubscriptionKeys } from "../disk/metric-subscriptions";

const autoMetricSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: undefined,
    fallbackSourceProfileIds: [],
    failureMode: "useFallback",
};

/** Refreshes disk volume picker data for multi-slot Property Inspector panels. */
export async function refreshDiskVolumeRuntimeCache(options: {
    readonly platform: NodeJS.Platform;
    readonly defaultSourceProfileId: string | undefined;
    readonly updateRuntimeCache: (patch: WidgetRuntimeCachePatch) => Promise<void>;
}): Promise<void> {
    // Disk volume options are discovered as a side effect of reading disk usage
    // keys. Multi-slot actions cannot use MetricAction.refreshMetricKeys here:
    // that helper intentionally assumes widget.slot exists.
    await backgroundMetricCollection.refreshReadPlanOnce(buildMetricReadPlanFromSourcePolicy({
        metricKeys: resolveDiskUsageMetricSubscriptionKeys(undefined),
        sourcePolicy: autoMetricSourcePolicy,
        defaultSourceProfileId: options.defaultSourceProfileId,
        platform: options.platform,
    }));

    await options.updateRuntimeCache({
        availableDiskVolumes: [...diskVolumeRegistry.getOptions()],
    });
}

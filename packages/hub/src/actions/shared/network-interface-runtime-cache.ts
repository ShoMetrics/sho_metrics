import { getNetworkAggregateMetricKey } from "../../runtime/network-metric-keys";
import { networkInterfaceRegistry } from "../../runtime/network-interfaces";
import { backgroundMetricCollection } from "../../runtime/metric-collection/background-metric-collection";
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import type { ResolvedMetricSourcePolicy } from "../../settings/resolved-settings";

const autoMetricSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: undefined,
    fallbackSourceProfileIds: [],
    failureMode: "useFallback",
};

export const NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS = [getNetworkAggregateMetricKey("download")] as const;

/** Refreshes network interface picker data for multi-slot Property Inspector panels. */
export async function refreshNetworkInterfaceRuntimeCache(options: {
    readonly platform: NodeJS.Platform;
    readonly defaultSourceProfileId: string | undefined;
    readonly updateRuntimeCache: (patch: WidgetRuntimeCachePatch) => Promise<void>;
}): Promise<void> {
    // Network interface options are discovered as a side effect of reading an
    // aggregate network key. Multi-slot actions cannot use MetricAction.refreshMetricKeys
    // here: that helper intentionally assumes widget.slot exists.
    await backgroundMetricCollection.refreshReadPlanOnce(buildMetricReadPlanFromSourcePolicy({
        metricKeys: NETWORK_INTERFACE_LIST_REFRESH_METRIC_KEYS,
        sourcePolicy: autoMetricSourcePolicy,
        defaultSourceProfileId: options.defaultSourceProfileId,
        platform: options.platform,
    }));

    await publishNetworkInterfaceRuntimeCache({
        updateRuntimeCache: options.updateRuntimeCache,
    });
}

/** Publishes the already-discovered network interface picker data. */
export function publishNetworkInterfaceRuntimeCache(options: {
    readonly updateRuntimeCache: (patch: WidgetRuntimeCachePatch) => Promise<void>;
}): Promise<void> {
    return options.updateRuntimeCache({
        availableNetworkInterfaces: [...networkInterfaceRegistry.getOptions()],
    });
}

import { resolveNetworkMetricKey } from "../../runtime/network-metric-keys";
import type { MetricView, NetworkDirection } from "../../settings/resolved-settings";

export interface NetworkMetricSubscriptionSettings {
    selectedView: MetricView;
    networkDirection: NetworkDirection;
    networkInterfaceId: string | undefined;
}

export function resolveNetworkMetricSubscriptionKeys(settings: NetworkMetricSubscriptionSettings): readonly string[] {
    const networkDirection = settings.networkDirection;

    if (
        settings.selectedView === "bar"
        || networkDirection === "both"
    ) {
        return [
            resolveNetworkMetricKey("upload", settings.networkInterfaceId),
            resolveNetworkMetricKey("download", settings.networkInterfaceId),
        ];
    }

    return [
        resolveNetworkMetricKey(networkDirection, settings.networkInterfaceId),
    ];
}

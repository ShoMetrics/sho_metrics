import { resolveNetworkMetricKey } from "../../runtime/network-metric-keys";
import type { MetricView, NetworkDirection } from "../../settings/resolved-settings";

export interface NetworkMetricSubscriptionSettings {
    selectedView: MetricView;
    networkDirection: NetworkDirection;
    networkInterfaceId: string | undefined;
}

export function resolveNetworkMetricSubscriptionKeys(settings: NetworkMetricSubscriptionSettings): readonly string[] {
    const displayDirection = settings.networkDirection;

    if (
        settings.selectedView === "bar"
        || displayDirection === "both"
    ) {
        return [
            resolveNetworkMetricKey("upload", settings.networkInterfaceId),
            resolveNetworkMetricKey("download", settings.networkInterfaceId),
        ];
    }

    return [
        resolveNetworkMetricKey(displayDirection, settings.networkInterfaceId),
    ];
}

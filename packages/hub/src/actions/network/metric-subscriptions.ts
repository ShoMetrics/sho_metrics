import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
} from "../../runtime/network-metric-keys";
import type { MetricView, NetworkDirection } from "../../settings/resolved-settings";

export interface NetworkMetricSubscriptionSettings {
    selectedView: MetricView;
    networkDirection: NetworkDirection;
    networkInterfaceId: string;
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

function resolveNetworkMetricKey(
    direction: Exclude<NetworkDirection, "both">,
    networkInterfaceId: string,
): string {
    return networkInterfaceId.length > 0
        ? getNetworkInterfaceMetricKey(direction, networkInterfaceId)
        : getNetworkAggregateMetricKey(direction);
}

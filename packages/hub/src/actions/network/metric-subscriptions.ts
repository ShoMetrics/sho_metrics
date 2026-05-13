import { networkInterfaceRegistry } from "../../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
} from "../../runtime/network-metric-keys";
import type { NetworkDirection, SingleMetricViewLayout } from "../../settings/resolved-settings";

export interface NetworkMetricSubscriptionSettings {
    graphicType: SingleMetricViewLayout;
    networkDirection: NetworkDirection;
    networkInterfaceId: string;
}

export function resolveNetworkMetricSubscriptionKeys(settings: NetworkMetricSubscriptionSettings): readonly string[] {
    const selectedNetworkInterface = networkInterfaceRegistry.resolveSelection(settings.networkInterfaceId);
    const displayDirection = settings.networkDirection;

    if (
        settings.graphicType === "linear"
        || displayDirection === "both"
    ) {
        return selectedNetworkInterface
            ? [
                getNetworkInterfaceMetricKey("upload", selectedNetworkInterface.id),
                getNetworkInterfaceMetricKey("download", selectedNetworkInterface.id),
            ]
            : [
                getNetworkAggregateMetricKey("upload"),
                getNetworkAggregateMetricKey("download"),
            ];
    }

    return [
        selectedNetworkInterface
            ? getNetworkInterfaceMetricKey(displayDirection, selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey(displayDirection),
    ];
}

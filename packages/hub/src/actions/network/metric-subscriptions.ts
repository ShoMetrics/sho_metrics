import { networkInterfaceRegistry } from "../../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
} from "../../runtime/network-metric-keys";
import type { GraphicType, NetworkDirection as NetworkDisplayDirection } from "../../settings/widget-settings";

export interface NetSpeedMetricSubscriptionSettings {
    graphicType: GraphicType;
    networkDirection: NetworkDisplayDirection;
    networkInterfaceId: string;
}

export function resolveNetSpeedMetricSubscriptionKeys(settings: NetSpeedMetricSubscriptionSettings): readonly string[] {
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

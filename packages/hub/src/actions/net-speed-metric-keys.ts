import type { SettingValue } from "./metric-visual-settings";
import { networkInterfaceRegistry } from "../runtime/network-interfaces";
import {
    getNetworkAggregateMetricKey,
    getNetworkInterfaceMetricKey,
    type NetworkDirection,
} from "../runtime/network-metric-keys";

export interface NetworkSpeedMetricKeySettings {
    graphicType?: SettingValue;
    networkDirection?: SettingValue;
    networkInterfaceId?: SettingValue;
}

type NetworkDisplayDirection = NetworkDirection | "both";

export function resolveNetSpeedMetricKeys(settings: NetworkSpeedMetricKeySettings): readonly string[] {
    const selectedNetworkInterface = resolveNetworkInterface(settings.networkInterfaceId);
    const displayDirection = normalizeNetworkDisplayDirection(settings.networkDirection);

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

    const direction = resolveSingleNetworkDirection(displayDirection);

    return [
        selectedNetworkInterface
            ? getNetworkInterfaceMetricKey(direction, selectedNetworkInterface.id)
            : getNetworkAggregateMetricKey(direction),
    ];
}

export function normalizeNetworkDisplayDirection(value: SettingValue): NetworkDisplayDirection {
    if (value === "download" || value === "upload") {
        return value;
    }

    return "both";
}

export function resolveSingleNetworkDirection(direction: NetworkDisplayDirection): NetworkDirection {
    return direction === "upload" ? "upload" : "download";
}

function resolveNetworkInterface(value: SettingValue) {
    if (typeof value === "string" && value.length > 0) {
        return networkInterfaceRegistry.findById(value);
    }

    return networkInterfaceRegistry.resolveAutomaticSelection();
}

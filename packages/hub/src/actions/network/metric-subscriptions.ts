import {
    getNetworkPingLatencyMetricKey,
    resolveNetworkMetricKey,
} from "../../runtime/network-metric-keys";
import type { MetricView, ResolvedNetworkReading } from "../../settings/resolved-settings";

export interface NetworkMetricSubscriptionSettings {
    selectedView: MetricView;
    reading: ResolvedNetworkReading;
}

export function resolveNetworkMetricSubscriptionKeys(settings: NetworkMetricSubscriptionSettings): readonly string[] {
    if (settings.reading.kind === "ping") {
        return [getNetworkPingLatencyMetricKey(settings.reading.targetHost)];
    }

    const networkDirection = settings.reading.direction;

    if (networkDirection === "both") {
        return [
            resolveNetworkMetricKey("upload", settings.reading.interfaceId),
            resolveNetworkMetricKey("download", settings.reading.interfaceId),
        ];
    }

    return [
        resolveNetworkMetricKey(networkDirection, settings.reading.interfaceId),
    ];
}


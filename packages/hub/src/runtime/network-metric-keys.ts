export type NetworkDirection = "download" | "upload";

const NETWORK_METRIC_PREFIX = "net.";

const DIRECTION_KEY_SEGMENTS: Record<NetworkDirection, string> = {
    download: "down",
    upload: "up",
};

export function getNetworkAggregateMetricKey(direction: NetworkDirection): string {
    return `${NETWORK_METRIC_PREFIX}${DIRECTION_KEY_SEGMENTS[direction]}`;
}

export function getNetworkInterfaceMetricKey(direction: NetworkDirection, interfaceId: string): string {
    return `${getNetworkAggregateMetricKey(direction)}.${encodeURIComponent(interfaceId)}`;
}

export function isNetworkMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(NETWORK_METRIC_PREFIX);
}

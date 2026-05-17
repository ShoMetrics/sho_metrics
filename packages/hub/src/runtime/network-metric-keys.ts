export type NetworkMetricDirection = "download" | "upload";

const NETWORK_METRIC_PREFIX = "net.";

const DIRECTION_KEY_SEGMENTS: Record<NetworkMetricDirection, string> = {
    download: "down",
    upload: "up",
};

export function getNetworkAggregateMetricKey(direction: NetworkMetricDirection): string {
    return `${NETWORK_METRIC_PREFIX}${DIRECTION_KEY_SEGMENTS[direction]}`;
}

export function getNetworkInterfaceMetricKey(direction: NetworkMetricDirection, interfaceId: string): string {
    return `${getNetworkAggregateMetricKey(direction)}.${encodeURIComponent(interfaceId)}`;
}

export function resolveNetworkMetricKey(
    direction: NetworkMetricDirection,
    interfaceId: string | undefined,
): string {
    return interfaceId && interfaceId.length > 0
        ? getNetworkInterfaceMetricKey(direction, interfaceId)
        : getNetworkAggregateMetricKey(direction);
}

export function isNetworkMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(NETWORK_METRIC_PREFIX);
}

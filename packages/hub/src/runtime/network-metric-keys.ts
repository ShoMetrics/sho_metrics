export type NetworkMetricDirection = "download" | "upload";

const NETWORK_METRIC_PREFIX = "net.";
const NETWORK_DOWNLOAD_METRIC_KEY = `${NETWORK_METRIC_PREFIX}down`;
const NETWORK_UPLOAD_METRIC_KEY = `${NETWORK_METRIC_PREFIX}up`;
const NETWORK_PING_LATENCY_METRIC_PREFIX = `${NETWORK_METRIC_PREFIX}ping.latency.`;

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

export function getNetworkPingLatencyMetricKey(targetHost: string): string {
    return `${NETWORK_PING_LATENCY_METRIC_PREFIX}${encodeURIComponent(targetHost)}`;
}

export function isNetworkMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(NETWORK_METRIC_PREFIX);
}

export function isNetworkPingLatencyMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(NETWORK_PING_LATENCY_METRIC_PREFIX)
        && metricKey.length > NETWORK_PING_LATENCY_METRIC_PREFIX.length;
}

export function isNetworkTrafficMetricKey(metricKey: string): boolean {
    return metricKey === NETWORK_DOWNLOAD_METRIC_KEY
        || metricKey === NETWORK_UPLOAD_METRIC_KEY
        || metricKey.startsWith(`${NETWORK_DOWNLOAD_METRIC_KEY}.`)
        || metricKey.startsWith(`${NETWORK_UPLOAD_METRIC_KEY}.`);
}

export function readNetworkPingLatencyMetricTargetHost(metricKey: string): string | undefined {
    if (!isNetworkPingLatencyMetricKey(metricKey)) {
        return undefined;
    }

    try {
        return decodeURIComponent(metricKey.slice(NETWORK_PING_LATENCY_METRIC_PREFIX.length));
    } catch (error) {
        void error;
        return undefined;
    }
}


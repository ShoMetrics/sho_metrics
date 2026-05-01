export type NetworkDirection = "download" | "upload";

const DIRECTION_KEY_SEGMENTS: Record<NetworkDirection, string> = {
    download: "down",
    upload: "up",
};

export function getNetworkAggregateMetricKey(direction: NetworkDirection): string {
    return `net.${DIRECTION_KEY_SEGMENTS[direction]}`;
}

export function getNetworkInterfaceMetricKey(direction: NetworkDirection, interfaceId: string): string {
    return `${getNetworkAggregateMetricKey(direction)}.${encodeURIComponent(interfaceId)}`;
}

import {
    getDiskThroughputMetricKey,
} from "../../runtime/disk-metric-keys";
import type {
    DiskMetricKind,
    DiskThroughputDirection as DiskThroughputDisplayDirection,
    GraphicType,
} from "../../settings/widget-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind: DiskMetricKind;
    graphicType: GraphicType;
    diskThroughputDirection: DiskThroughputDisplayDirection;
}

export function resolveDiskMetricSubscriptionKeys(settings: DiskMetricSubscriptionSettings): readonly string[] {
    if (settings.diskMetricKind !== "throughput") {
        return [];
    }

    const throughputDirection = settings.diskThroughputDirection;

    if (isDualDiskThroughputDisplay(settings.graphicType, throughputDirection)) {
        return [
            getDiskThroughputMetricKey("read"),
            getDiskThroughputMetricKey("write"),
        ];
    }

    return [getDiskThroughputMetricKey(throughputDirection === "both" ? "total" : throughputDirection)];
}

export function isDualDiskThroughputDisplay(
    graphicType: GraphicType | undefined,
    direction: DiskThroughputDisplayDirection,
): boolean {
    return direction === "both"
        && (graphicType === "circular" || graphicType === "text" || graphicType === "sparkline");
}

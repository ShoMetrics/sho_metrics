import {
    getDiskThroughputMetricKey,
} from "../../runtime/disk-metric-keys";
import type {
    DiskThroughputDirection as DiskThroughputDisplayDirection,
    SingleMetricViewLayout,
} from "../../settings/resolved-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind: "usage" | "throughput";
    graphicType: SingleMetricViewLayout;
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
    graphicType: SingleMetricViewLayout | undefined,
    direction: DiskThroughputDisplayDirection,
): boolean {
    return direction === "both"
        && (graphicType === "circular" || graphicType === "text" || graphicType === "sparkline");
}

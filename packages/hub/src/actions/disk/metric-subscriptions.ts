import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    getDiskVolumeMetricKey,
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

export function resolveDiskUsageMetricSubscriptionKeys(volumeId: string | undefined): readonly string[] {
    if (volumeId && volumeId.length > 0) {
        return [
            getDiskVolumeMetricKey("used", volumeId),
            getDiskVolumeMetricKey("total", volumeId),
            getDiskVolumeMetricKey("available", volumeId),
        ];
    }

    return [getDefaultDiskUsageMetricKey("used"), getDefaultDiskUsageMetricKey("total"), getDefaultDiskUsageMetricKey("available")];
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

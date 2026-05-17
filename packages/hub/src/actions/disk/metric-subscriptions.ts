import {
    getDiskThroughputMetricKey,
    resolveDiskUsageMetricKey,
} from "../../runtime/disk-metric-keys";
import type {
    DiskThroughputDirection as DiskThroughputDisplayDirection,
    MetricView,
} from "../../settings/resolved-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind: "usage" | "throughput";
    selectedView: MetricView;
    diskThroughputDirection: DiskThroughputDisplayDirection;
}

export function resolveDiskMetricSubscriptionKeys(settings: DiskMetricSubscriptionSettings): readonly string[] {
    if (settings.diskMetricKind !== "throughput") {
        return [];
    }

    const throughputDirection = settings.diskThroughputDirection;

    if (isDualDiskThroughputDisplay(settings.selectedView, throughputDirection)) {
        return [
            getDiskThroughputMetricKey("read"),
            getDiskThroughputMetricKey("write"),
        ];
    }

    return [getDiskThroughputMetricKey(throughputDirection === "both" ? "total" : throughputDirection)];
}

export function resolveDiskUsageMetricSubscriptionKeys(volumeId: string | undefined): readonly string[] {
    return [
        resolveDiskUsageMetricKey("used", volumeId),
        resolveDiskUsageMetricKey("total", volumeId),
        resolveDiskUsageMetricKey("available", volumeId),
    ];
}

export function isDualDiskThroughputDisplay(
    selectedView: MetricView | undefined,
    direction: DiskThroughputDisplayDirection,
): boolean {
    return direction === "both"
        && (selectedView === "circle" || selectedView === "text" || selectedView === "line");
}

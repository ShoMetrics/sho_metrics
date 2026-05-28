import {
    getDiskThroughputMetricKey,
    resolveDiskUsageMetricKey,
} from "../../runtime/disk-metric-keys";
import type {
    DiskThroughputDirection as ResolvedDiskThroughputDirection,
    MetricView,
} from "../../settings/resolved-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind: "usage" | "throughput";
    selectedView: MetricView;
    diskThroughputDirection: ResolvedDiskThroughputDirection;
}

export function resolveDiskMetricSubscriptionKeys(settings: DiskMetricSubscriptionSettings): readonly string[] {
    if (settings.diskMetricKind !== "throughput") {
        return [];
    }

    const throughputDirection = settings.diskThroughputDirection;

    if (shouldSubscribeToDiskThroughputChannels(settings.selectedView, throughputDirection)) {
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

function shouldSubscribeToDiskThroughputChannels(
    selectedView: MetricView | undefined,
    direction: ResolvedDiskThroughputDirection,
): boolean {
    return direction === "both"
        && (selectedView === "bar" || selectedView === "circle" || selectedView === "text" || selectedView === "line");
}

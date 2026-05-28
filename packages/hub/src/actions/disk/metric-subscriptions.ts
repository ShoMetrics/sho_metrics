import {
    getDiskThroughputMetricKey,
    resolveDiskUsageMetricKey,
} from "../../runtime/disk-metric-keys";
import type {
    DiskThroughputDirection as ResolvedDiskThroughputDirection,
} from "../../settings/resolved-settings";

export interface DiskMetricSubscriptionSettings {
    diskMetricKind: "usage" | "throughput";
    diskThroughputDirection: ResolvedDiskThroughputDirection;
}

export function resolveDiskMetricSubscriptionKeys(settings: DiskMetricSubscriptionSettings): readonly string[] {
    if (settings.diskMetricKind !== "throughput") {
        return [];
    }

    const throughputDirection = settings.diskThroughputDirection;

    if (throughputDirection === "both") {
        return [
            getDiskThroughputMetricKey("read"),
            getDiskThroughputMetricKey("write"),
        ];
    }

    return [getDiskThroughputMetricKey(throughputDirection)];
}

export function resolveDiskUsageMetricSubscriptionKeys(volumeId: string | undefined): readonly string[] {
    return [
        resolveDiskUsageMetricKey("used", volumeId),
        resolveDiskUsageMetricKey("total", volumeId),
        resolveDiskUsageMetricKey("available", volumeId),
    ];
}

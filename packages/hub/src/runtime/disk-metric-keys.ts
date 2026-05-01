export type DiskUsageMetric = "used" | "total" | "available" | "percent";
export type DiskThroughputDirection = "read" | "write" | "total";

const DEFAULT_DISK_USAGE_PREFIX = "disk.usage";
const DISK_VOLUME_PREFIX = "disk.volume";

export function getDefaultDiskUsageMetricKey(metric: DiskUsageMetric): string {
    return `${DEFAULT_DISK_USAGE_PREFIX}.${metric}`;
}

export function getDiskVolumeMetricKey(metric: DiskUsageMetric, volumeId: string): string {
    return `${DISK_VOLUME_PREFIX}.${encodeURIComponent(volumeId)}.${metric}`;
}

export function getDiskThroughputMetricKey(direction: DiskThroughputDirection): string {
    return `disk.throughput.${direction}`;
}

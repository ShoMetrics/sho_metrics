export type DiskUsageMetric = "used" | "total" | "available" | "percent";
export type DiskThroughputMetricDirection = "read" | "write" | "total";

const DEFAULT_DISK_USAGE_PREFIX = "disk.usage";
const DISK_VOLUME_PREFIX = "disk.volume";
const DISK_THROUGHPUT_PREFIX = "disk.throughput";
const DISK_METRIC_PREFIX = "disk.";

export function getDefaultDiskUsageMetricKey(metric: DiskUsageMetric): string {
    return `${DEFAULT_DISK_USAGE_PREFIX}.${metric}`;
}

export function getDiskVolumeMetricKey(metric: DiskUsageMetric, volumeId: string): string {
    return `${DISK_VOLUME_PREFIX}.${encodeURIComponent(volumeId)}.${metric}`;
}

export function resolveDiskUsageMetricKey(
    metric: DiskUsageMetric,
    volumeId: string | undefined,
): string {
    return volumeId && volumeId.length > 0
        ? getDiskVolumeMetricKey(metric, volumeId)
        : getDefaultDiskUsageMetricKey(metric);
}

export function getDiskThroughputMetricKey(direction: DiskThroughputMetricDirection): string {
    return `${DISK_THROUGHPUT_PREFIX}.${direction}`;
}

export function isDiskUsageMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(`${DEFAULT_DISK_USAGE_PREFIX}.`)
        || metricKey.startsWith(`${DISK_VOLUME_PREFIX}.`);
}

export function isDiskThroughputMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(`${DISK_THROUGHPUT_PREFIX}.`);
}

export function isDiskMetricKey(metricKey: string): boolean {
    return metricKey.startsWith(DISK_METRIC_PREFIX);
}

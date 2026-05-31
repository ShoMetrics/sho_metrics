import {
    getDiskThroughputMetricKey,
    isDiskThroughputMetricKey,
    isDiskUsageMetricKey,
} from "../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    isCpuMetricKey,
    isGpuMetricKey,
    isRamMetricKey,
} from "../metric-keys";
import { isNetworkMetricKey } from "../network-metric-keys";
import type { MetricSupportPlatform } from "./metric-support-platform";

const NODE_SYSTEM_CPU_METRIC_KEYS = new Set<string>([
    CPU_USAGE_METRIC_KEY,
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
]);

const NODE_SYSTEM_NON_WINDOWS_GPU_METRIC_KEYS = new Set<string>([
    GPU_USAGE_METRIC_KEY,
]);

const NODE_SYSTEM_DARWIN_DISK_THROUGHPUT_METRIC_KEYS = new Set<string>([
    getDiskThroughputMetricKey("read"),
    getDiskThroughputMetricKey("write"),
]);

/**
 * Reports whether node-system can produce a metric on the target platform.
 *
 * This is static source capability, not a hardware probe. macOS exposes GPU
 * usage through IOAccelerator. More specific GPU metrics stay hidden until a
 * source path is intentionally supported on that platform.
 */
export function isNodeSystemMetricSupportedOnPlatform(
    metricKey: string,
    platform: MetricSupportPlatform,
): boolean {
    if (isCpuMetricKey(metricKey)) {
        return NODE_SYSTEM_CPU_METRIC_KEYS.has(metricKey);
    }

    if (isRamMetricKey(metricKey) || isNetworkMetricKey(metricKey) || isDiskUsageMetricKey(metricKey)) {
        return true;
    }

    if (isDiskThroughputMetricKey(metricKey)) {
        return platform === "darwin"
            && NODE_SYSTEM_DARWIN_DISK_THROUGHPUT_METRIC_KEYS.has(metricKey);
    }

    if (isGpuMetricKey(metricKey)) {
        return platform === "win32" || NODE_SYSTEM_NON_WINDOWS_GPU_METRIC_KEYS.has(metricKey);
    }

    return false;
}

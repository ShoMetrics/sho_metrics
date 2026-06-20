import {
    getDefaultDiskUsageMetricKey,
    getDiskThroughputMetricKey,
    isDiskUsageMetricKey,
} from "../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_METRIC_KEYS,
    isBatteryMetricKey,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
} from "../metric-keys";
import {
    getNetworkAggregateMetricKey,
    isNetworkMetricKey,
} from "../network-metric-keys";
import type { SourceCandidate } from "./metric-read-plan";
import {
    NODE_SYSTEM_SOURCE_ID,
    SYSTEM_BATTERY_SOURCE_ID,
    VENDOR_HID_BATTERY_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";
import { isNodeSystemMetricSupportedOnPlatform } from "../source-capabilities/node-system-platform-capabilities";
import type { MetricSupportPlatform } from "../source-capabilities/metric-support-platform";

const NODE_SYSTEM_ONLY_METRIC_KEYS = [
    CPU_USAGE_METRIC_KEY,
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    getNetworkAggregateMetricKey("download"),
    getNetworkAggregateMetricKey("upload"),
    getDefaultDiskUsageMetricKey("used"),
    getDefaultDiskUsageMetricKey("total"),
    getDefaultDiskUsageMetricKey("available"),
    getDefaultDiskUsageMetricKey("percent"),
] as const;

const WINDOWS_HELPER_ONLY_METRIC_KEYS = [
    CPU_TEMP_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
] as const;

const WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEYS = [
    getDiskThroughputMetricKey("read"),
    getDiskThroughputMetricKey("write"),
] as const;

const WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEYS = [...GPU_METRIC_KEYS] as const;

const SYSTEM_BATTERY_CANDIDATES = [{ sourceId: SYSTEM_BATTERY_SOURCE_ID }] as const;
const VENDOR_HID_BATTERY_CANDIDATES = [{ sourceId: VENDOR_HID_BATTERY_SOURCE_ID }] as const;

/**
 * Stable built-in metric keys that must receive an explicit local:auto source decision.
 *
 * When adding a new stable built-in metric key, update the explicit source
 * decision lists above. Dynamic source-native catalog ids do not belong here;
 * they must carry an explicit source profile from the catalog picker.
 *
 * If a future stable built-in metric is available only from the helper, add it
 * to the explicit helper-only list instead of adding action-local checks.
 */
export const BUILT_IN_STABLE_METRIC_KEYS = [
    ...NODE_SYSTEM_ONLY_METRIC_KEYS,
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    ...WINDOWS_HELPER_ONLY_METRIC_KEYS,
    ...WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEYS,
    ...WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEYS,
] as const;

const NODE_SYSTEM_ONLY_METRIC_KEY_SET = new Set<string>(NODE_SYSTEM_ONLY_METRIC_KEYS);
const WINDOWS_HELPER_ONLY_METRIC_KEY_SET = new Set<string>(WINDOWS_HELPER_ONLY_METRIC_KEYS);
const WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEY_SET = new Set<string>(
    WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEYS,
);
const WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEY_SET = new Set<string>(
    WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEYS,
);

const NODE_SYSTEM_CANDIDATES = [{ sourceId: NODE_SYSTEM_SOURCE_ID }] as const;
const WINDOWS_HELPER_CANDIDATES = [{ sourceId: WINDOWS_HELPER_SOURCE_ID }] as const;
const WINDOWS_HELPER_THEN_NODE_CANDIDATES = [
    { sourceId: WINDOWS_HELPER_SOURCE_ID },
    { sourceId: NODE_SYSTEM_SOURCE_ID },
] as const;

/**
 * Resolves the source order for one built-in local:auto metric.
 *
 * This is intentionally a small exception table, not a source taxonomy. It
 * handles ShoMetrics stable metric keys and known OS aggregate dynamic keys;
 * source-native catalog ids must use explicit source profiles instead.
 */
export function resolveLocalAutoMetricSourceCandidates(
    metricKey: string,
    platform: MetricSupportPlatform,
): readonly SourceCandidate[] {
    if (metricKey === SYSTEM_BATTERY_PERCENT_METRIC_KEY) {
        return SYSTEM_BATTERY_CANDIDATES;
    }

    if (isBatteryMetricKey(metricKey)) {
        return VENDOR_HID_BATTERY_CANDIDATES;
    }

    if (WINDOWS_HELPER_ONLY_METRIC_KEY_SET.has(metricKey)) {
        return filterSourceCandidatesForMetricPlatform(WINDOWS_HELPER_CANDIDATES, metricKey, platform);
    }

    if (WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEY_SET.has(metricKey)) {
        return filterSourceCandidatesForMetricPlatform(
            platform === "win32" ? WINDOWS_HELPER_CANDIDATES : NODE_SYSTEM_CANDIDATES,
            metricKey,
            platform,
        );
    }

    if (WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEY_SET.has(metricKey)) {
        return filterSourceCandidatesForMetricPlatform(WINDOWS_HELPER_THEN_NODE_CANDIDATES, metricKey, platform);
    }

    if (hasExplicitLocalAutoMetricSourcePreference(metricKey)) {
        return filterSourceCandidatesForMetricPlatform(NODE_SYSTEM_CANDIDATES, metricKey, platform);
    }

    return NODE_SYSTEM_CANDIDATES;
}

/**
 * Reports whether a built-in metric has no local:auto source fallback without the helper.
 *
 * This is a static routing fact, not a probe result. Do not use sample
 * freshness, hardware vendor, or external tool availability to answer it.
 */
export function isBuiltInMetricHelperOnly(metricKey: string): boolean {
    return WINDOWS_HELPER_ONLY_METRIC_KEY_SET.has(metricKey);
}

/**
 * Reports whether a metric key has an explicit local:auto source decision.
 *
 * This is the guard used by tests so newly added stable built-in keys cannot
 * pass only because the resolver has a defensive node-system fallback.
 */
export function hasExplicitLocalAutoMetricSourcePreference(metricKey: string): boolean {
    return NODE_SYSTEM_ONLY_METRIC_KEY_SET.has(metricKey)
        || WINDOWS_HELPER_ONLY_METRIC_KEY_SET.has(metricKey)
        || WINDOWS_HELPER_ON_WINDOWS_NODE_ON_OTHER_PLATFORM_METRIC_KEY_SET.has(metricKey)
        || WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEY_SET.has(metricKey)
        || isBatteryMetricKey(metricKey)
        || isNetworkMetricKey(metricKey)
        || isDiskUsageMetricKey(metricKey);
}

/** Reports whether a stable built-in metric has any local source on a platform. */
export function isBuiltInMetricSupportedOnPlatform(
    metricKey: string,
    platform: MetricSupportPlatform,
): boolean {
    return hasExplicitLocalAutoMetricSourcePreference(metricKey)
        && resolveLocalAutoMetricSourceCandidates(metricKey, platform).length > 0;
}

/**
 * Reports whether a built-in local source can produce a metric on a platform.
 *
 * This is static source capability, not a hardware or helper availability probe.
 */
export function localSourceSupportsMetricOnPlatform(
    sourceId: string,
    metricKey: string,
    platform: MetricSupportPlatform,
): boolean {
    switch (sourceId) {
        case WINDOWS_HELPER_SOURCE_ID:
            return platform === "win32";
        case SYSTEM_BATTERY_SOURCE_ID:
            return metricKey === SYSTEM_BATTERY_PERCENT_METRIC_KEY;
        case VENDOR_HID_BATTERY_SOURCE_ID:
            return isBatteryMetricKey(metricKey) && metricKey !== SYSTEM_BATTERY_PERCENT_METRIC_KEY;
        case NODE_SYSTEM_SOURCE_ID:
            return isNodeSystemMetricSupportedOnPlatform(metricKey, platform);
        default:
            return true;
    }
}

function filterSourceCandidatesForMetricPlatform(
    sourceCandidates: readonly SourceCandidate[],
    metricKey: string,
    platform: MetricSupportPlatform,
): readonly SourceCandidate[] {
    return sourceCandidates.filter(sourceCandidate =>
        localSourceSupportsMetricOnPlatform(sourceCandidate.sourceId, metricKey, platform),
    );
}

import {
    getDefaultDiskUsageMetricKey,
    isDiskUsageMetricKey,
} from "../disk-metric-keys";
import {
    CPU_BASE_FREQUENCY_METRIC_KEY,
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_METRIC_KEYS,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../metric-keys";
import {
    getNetworkAggregateMetricKey,
    isNetworkMetricKey,
} from "../network-metric-keys";
import type { SourceCandidate } from "./metric-read-plan";
import {
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../sources/source-ids";

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

const WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEYS = [...GPU_METRIC_KEYS] as const;

/**
 * Stable built-in metric keys that must receive an explicit local:auto source decision.
 *
 * When adding a new stable built-in metric key, update the explicit source
 * decision lists above. Dynamic source-native catalog ids do not belong here;
 * they must carry an explicit source profile from the catalog picker.
 *
 * If a future stable built-in metric is available only from the helper, add a
 * third explicit helper-only list at that time. Do not add an empty placeholder
 * list before a real metric needs it.
 */
export const BUILT_IN_STABLE_METRIC_KEYS = [
    ...NODE_SYSTEM_ONLY_METRIC_KEYS,
    ...WINDOWS_HELPER_ONLY_METRIC_KEYS,
    ...WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEYS,
] as const;

const NODE_SYSTEM_ONLY_METRIC_KEY_SET = new Set<string>(NODE_SYSTEM_ONLY_METRIC_KEYS);
const WINDOWS_HELPER_ONLY_METRIC_KEY_SET = new Set<string>(WINDOWS_HELPER_ONLY_METRIC_KEYS);
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
    platform: NodeJS.Platform,
): readonly SourceCandidate[] {
    if (platform !== "win32") {
        return NODE_SYSTEM_CANDIDATES;
    }

    if (WINDOWS_HELPER_ONLY_METRIC_KEY_SET.has(metricKey)) {
        return WINDOWS_HELPER_CANDIDATES;
    }

    if (WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEY_SET.has(metricKey)) {
        return WINDOWS_HELPER_THEN_NODE_CANDIDATES;
    }

    if (hasExplicitLocalAutoMetricSourcePreference(metricKey)) {
        return NODE_SYSTEM_CANDIDATES;
    }

    return NODE_SYSTEM_CANDIDATES;
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
        || WINDOWS_HELPER_WITH_NODE_FALLBACK_METRIC_KEY_SET.has(metricKey)
        || isNetworkMetricKey(metricKey)
        || isDiskUsageMetricKey(metricKey);
}

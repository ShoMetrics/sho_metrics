import {
    isCpuMetricKey,
    isGpuMetricKey,
    isRamMetricKey,
} from "./metric-keys";
import { isDiskMetricKey } from "./disk-metric-keys";
import { isNetworkMetricKey } from "./network-metric-keys";

export type MetricPollingGroupId =
    | "all"
    | "cpu"
    | "memory"
    | "disk"
    | "network"
    | "gpu"
    | "unknown";

type StaticMetricPollingGroupId = Exclude<MetricPollingGroupId, "all" | "unknown">;

export interface MetricPollingGroup {
    readonly id: MetricPollingGroupId;
    readonly metricKeys: readonly string[];
}

interface StaticMetricPollingGroupRule {
    readonly id: StaticMetricPollingGroupId;
    readonly ownsMetricKey: (metricKey: string) => boolean;
}

const POLLING_GROUP_ORDER: readonly MetricPollingGroupId[] = [
    "cpu",
    "memory",
    "disk",
    "network",
    "gpu",
    "unknown",
];

/**
 * Phase 5a bridge for the current built-in collectors.
 *
 * These rules group by collector cost boundary, not by a permanent hardware
 * taxonomy. Do not grow this into helper/source-specific string predicates.
 * Before adding LHM or any source with dynamic user-selectable metric ids,
 * replace this with source-declared ownership or descriptor metadata.
 */
const STATIC_METRIC_POLLING_GROUP_RULES: readonly StaticMetricPollingGroupRule[] = [
    { id: "cpu", ownsMetricKey: isCpuMetricKey },
    { id: "memory", ownsMetricKey: isRamMetricKey },
    { id: "disk", ownsMetricKey: isDiskMetricKey },
    { id: "network", ownsMetricKey: isNetworkMetricKey },
    { id: "gpu", ownsMetricKey: isGpuMetricKey },
];

/**
 * Partitions metric keys by collector ownership so one slow collector does not
 * block unrelated widgets while same-collector keys stay coalesced.
 */
export function partitionMetricKeysByPollingGroup(metricKeys: readonly string[]): readonly MetricPollingGroup[] {
    if (metricKeys.length === 0) {
        return [{ id: "all", metricKeys: [] }];
    }

    const metricKeysByGroup = new Map<MetricPollingGroupId, string[]>();

    for (const metricKey of Array.from(new Set(metricKeys)).sort()) {
        const pollingGroupId = resolveMetricPollingGroupId(metricKey);
        const groupMetricKeys = metricKeysByGroup.get(pollingGroupId);

        if (groupMetricKeys) {
            groupMetricKeys.push(metricKey);
            continue;
        }

        metricKeysByGroup.set(pollingGroupId, [metricKey]);
    }

    return POLLING_GROUP_ORDER
        .map(pollingGroupId => ({
            id: pollingGroupId,
            metricKeys: metricKeysByGroup.get(pollingGroupId) ?? [],
        }))
        .filter(pollingGroup => pollingGroup.metricKeys.length > 0);
}

export function resolveMetricPollingGroupId(metricKey: string): MetricPollingGroupId {
    return STATIC_METRIC_POLLING_GROUP_RULES.find(rule => rule.ownsMetricKey(metricKey))?.id ?? "unknown";
}

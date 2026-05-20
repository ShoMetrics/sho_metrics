import { resolveMetricPollingGroupId } from "./metric-polling-groups";
import {
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type SourceCandidate,
} from "./sources/metric-read-plan";
import type { SourceMetricPollingGroupResolution } from "./sources/source-polling-groups";
import type { SourceRegistry } from "./sources/source-registry";

export interface PlannedMetricPollingGroup {
    readonly id: string;
    readonly metricKeys: readonly string[];
}

/**
 * Partitions metric keys by fallback-aware source-declared collector ownership.
 *
 * The Scheduler uses this planner to decide which metric keys are safe to poll
 * together. The group id is a source-candidate signature, not a hardware label:
 * two metrics only coalesce when every source candidate in the read plan would
 * collect them through the same source-scoped cost boundary.
 */
export function planMetricPollingGroups(
    readPlan: MetricReadPlan,
    sourceRegistry: SourceRegistry,
): readonly PlannedMetricPollingGroup[] {
    const normalizedReadPlan = normalizeMetricReadPlan(readPlan);

    if (normalizedReadPlan.metricKeys.length === 0) {
        return [{ id: "all", metricKeys: [] }];
    }

    const sourceCandidates = selectSourceCandidatesForFailureMode(normalizedReadPlan);
    const resolutionsBySourceId = resolveMetricPollingGroupsBySourceId(
        normalizedReadPlan.metricKeys,
        sourceCandidates,
        sourceRegistry,
    );
    const metricKeysByGroupId = new Map<string, string[]>();

    for (const metricKey of normalizedReadPlan.metricKeys) {
        const groupId = buildEffectivePollingGroupId(metricKey, sourceCandidates, resolutionsBySourceId);
        const groupMetricKeys = metricKeysByGroupId.get(groupId);

        if (groupMetricKeys) {
            groupMetricKeys.push(metricKey);
            continue;
        }

        metricKeysByGroupId.set(groupId, [metricKey]);
    }

    return Array.from(metricKeysByGroupId.entries())
        .map(([id, metricKeys]) => ({ id, metricKeys }));
}

function selectSourceCandidatesForFailureMode(readPlan: MetricReadPlan): readonly SourceCandidate[] {
    // In non-fallback modes only the primary candidate can affect this poll, so
    // fallback ownership must not split or merge the scheduled group.
    return readPlan.failureMode === "fallback"
        ? readPlan.sourceCandidates
        : readPlan.sourceCandidates.slice(0, 1);
}

function resolveMetricPollingGroupsBySourceId(
    metricKeys: readonly string[],
    sourceCandidates: readonly SourceCandidate[],
    sourceRegistry: SourceRegistry,
): ReadonlyMap<string, ReadonlyMap<string, SourceMetricPollingGroupResolution>> {
    const resolutionsBySourceId = new Map<string, ReadonlyMap<string, SourceMetricPollingGroupResolution>>();

    for (const sourceCandidate of sourceCandidates) {
        const sourceClient = sourceRegistry.resolveSourceClient(sourceCandidate.sourceId);

        // Temporary migration bridge: sources without declared ownership keep
        // Phase 5a static grouping until every built-in source owns this mapping.
        resolutionsBySourceId.set(
            sourceCandidate.sourceId,
            sourceClient?.resolveMetricPollingGroups?.(metricKeys) ?? resolveMetricKeysWithStaticBridge(metricKeys),
        );
    }

    return resolutionsBySourceId;
}

function resolveMetricKeysWithStaticBridge(
    metricKeys: readonly string[],
): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
    const resolutions = new Map<string, SourceMetricPollingGroupResolution>();

    // Temporary Phase 5b migration bridge for legacy sources. The input has
    // already been normalized, so iterating directly avoids running the static
    // predicate cascade twice.
    for (const metricKey of metricKeys) {
        const pollingGroupId = resolveMetricPollingGroupId(metricKey);
        resolutions.set(metricKey, pollingGroupId === "unknown"
            ? { state: "unknown" }
            : { state: "owned", pollingGroupId });
    }

    return resolutions;
}

function buildEffectivePollingGroupId(
    metricKey: string,
    sourceCandidates: readonly SourceCandidate[],
    resolutionsBySourceId: ReadonlyMap<string, ReadonlyMap<string, SourceMetricPollingGroupResolution>>,
): string {
    if (sourceCandidates.length === 0) {
        // Missing source profiles should not crash scheduler planning. Keep the
        // metric isolated and let the read path naturally produce no data.
        return JSON.stringify([`no-source:unknown:${metricKey}`]);
    }

    return JSON.stringify(sourceCandidates.map(sourceCandidate => {
        const resolution = resolutionsBySourceId.get(sourceCandidate.sourceId)?.get(metricKey) ?? { state: "unknown" };

        return formatSourceResolution(sourceCandidate.sourceId, metricKey, resolution);
    }));
}

function formatSourceResolution(
    sourceId: string,
    metricKey: string,
    resolution: SourceMetricPollingGroupResolution,
): string {
    switch (resolution.state) {
        case "owned":
            return `${sourceId}:owned:${resolution.pollingGroupId}`;
        case "unsupported":
            return `${sourceId}:unsupported`;
        case "unknown":
            return `${sourceId}:unknown:${metricKey}`;
    }
}

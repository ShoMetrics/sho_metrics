import type { ResolvedMetricSourcePolicy } from "../../settings/resolved-settings";
import { resolveLocalAutoMetricSourceCandidates } from "./metric-source-preferences";
import {
    LOCAL_SOURCE_SCOPE_ID,
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type SourceCandidate,
} from "./metric-read-plan";
import {
    BUILT_IN_LOCAL_AUTO_SOURCE_PROFILE_ID,
    BUILT_IN_LOCAL_SOURCE_PROFILE_ID_PREFIX,
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
    buildUserSourceProfileSourceId,
} from "./source-ids";

/** Options for building a runtime read plan from resolved source settings. */
export interface BuildMetricReadPlanFromSourcePolicyOptions {
    /** ShoMetrics canonical metric keys requested by one action or scheduler group. */
    readonly metricKeys: readonly string[];

    /** Resolved widget source policy from settings. */
    readonly sourcePolicy: ResolvedMetricSourcePolicy;

    /** Resolved global default source profile id. */
    readonly defaultSourceProfileId: string | undefined;

    /** Platform used to expand built-in local auto source profiles. */
    readonly platform?: NodeJS.Platform;
}

type SourceProfileResolution = StaticSourceProfileResolution | MetricRoutedSourceProfileResolution;

interface StaticSourceProfileResolution {
    readonly kind: "static";
    readonly sourceScopeId: string;
    readonly sourceCandidates: readonly SourceCandidate[];
}

interface MetricRoutedSourceProfileResolution {
    readonly kind: "metricRouted";
    readonly sourceScopeId: string;
    readonly resolveMetricSourceCandidates: (
        metricKey: string,
    ) => readonly SourceCandidate[];
}

/** Builds a runtime read plan from resolved settings without probing source availability. */
export function buildMetricReadPlanFromSourcePolicy(
    options: BuildMetricReadPlanFromSourcePolicyOptions,
): MetricReadPlan {
    const platform = options.platform ?? process.platform;
    const primarySourceProfileId = normalizeSourceProfileId(options.sourcePolicy.primarySourceProfileId)
        ?? normalizeSourceProfileId(options.defaultSourceProfileId)
        ?? BUILT_IN_LOCAL_AUTO_SOURCE_PROFILE_ID;
    const primaryResolution = resolveSourceProfileReference(
        primarySourceProfileId,
        platform,
    );
    const fallbackResolutions = options.sourcePolicy.failureMode === "useFallback"
        ? options.sourcePolicy.fallbackSourceProfileIds
            .map(normalizeSourceProfileId)
            .filter((sourceProfileId): sourceProfileId is string => sourceProfileId !== undefined)
            .map(sourceProfileId => resolveSourceProfileReference(
                sourceProfileId,
                platform,
            ))
        : [];
    return normalizeMetricReadPlan({
        metrics: options.metricKeys.map(metricKey => {
            const primarySourceCandidates = selectResolutionCandidatesForMetric(primaryResolution, metricKey);
            const fallbackSourceCandidates = fallbackResolutions
                .flatMap(resolution => selectResolutionCandidatesForMetric(resolution, metricKey));
            const sourceCandidates = [
                ...primarySourceCandidates,
                ...fallbackSourceCandidates,
            ];
            const shouldFallback = primarySourceCandidates.length > 1 || fallbackSourceCandidates.length > 0;

            return {
                sourceScopeId: primaryResolution.sourceScopeId,
                metricKey,
                sourceCandidates,
                failureMode: shouldFallback ? "fallback" : "empty",
            };
        }),
    });
}

function resolveSourceProfileReference(
    sourceProfileId: string,
    platform: NodeJS.Platform,
): SourceProfileResolution {
    // Built-in local ids use a reserved namespace and are never converted to
    // user-defined profile-backed source ids, even if a stored profile reuses the prefix.
    const builtInResolution = resolveBuiltInLocalSourceProfile(sourceProfileId, platform);
    if (builtInResolution) {
        return builtInResolution;
    }

    if (sourceProfileId.startsWith(BUILT_IN_LOCAL_SOURCE_PROFILE_ID_PREFIX)) {
        return {
            kind: "static",
            sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
            sourceCandidates: [],
        };
    }

    // User-defined profile ids are already resolved settings intent. The
    // registry owns whether a matching profile-backed SourceClient exists.
    return resolveUserDefinedSourceProfile(sourceProfileId);
}

function resolveUserDefinedSourceProfile(sourceProfileId: string): SourceProfileResolution {
    return {
        kind: "static",
        sourceScopeId: buildUserSourceProfileSourceId(sourceProfileId),
        sourceCandidates: [{
            sourceId: buildUserSourceProfileSourceId(sourceProfileId),
        }],
    };
}

function resolveBuiltInLocalSourceProfile(
    sourceProfileId: string,
    platform: NodeJS.Platform,
): SourceProfileResolution | undefined {
    switch (sourceProfileId) {
        case BUILT_IN_LOCAL_AUTO_SOURCE_PROFILE_ID:
            return {
                kind: "metricRouted",
                sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
                resolveMetricSourceCandidates: metricKey => resolveLocalAutoMetricSourceCandidates(
                    metricKey,
                    platform,
                ),
            };
        case BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID:
            return {
                kind: "static",
                sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
                sourceCandidates: [{ sourceId: WINDOWS_HELPER_SOURCE_ID }],
            };
        case BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID:
            return {
                kind: "static",
                sourceScopeId: LOCAL_SOURCE_SCOPE_ID,
                sourceCandidates: [{ sourceId: NODE_SYSTEM_SOURCE_ID }],
            };
        default:
            return undefined;
    }
}

function normalizeSourceProfileId(sourceProfileId: string | undefined): string | undefined {
    return sourceProfileId && sourceProfileId.length > 0
        ? sourceProfileId
        : undefined;
}

function selectResolutionCandidatesForMetric(
    resolution: SourceProfileResolution,
    metricKey: string,
): readonly SourceCandidate[] {
    return resolution.kind === "metricRouted"
        ? resolution.resolveMetricSourceCandidates(metricKey)
        : resolution.sourceCandidates;
}

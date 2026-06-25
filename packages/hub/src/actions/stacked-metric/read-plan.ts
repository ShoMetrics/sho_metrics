import {
    CPU_MODEL_METRIC_KEY,
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import {
    listMetricReadPlanKeys,
    normalizeMetricReadPlan,
    type MetricReadPlan,
    type MetricReadRoute,
} from "../../runtime/source-routing/metric-read-plan";
import { buildCustomHttpMetricReadPlan } from "../../runtime/source-routing/custom-http-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
import {
    buildStackedCustomHttpConsumerSlug,
    type CustomHttpRuntimeIdentity,
} from "../../runtime/sources/custom-http/custom-http-metric-key";
import { pluginGlobalSettingsStore } from "../../settings/global-settings-store";
import type {
    ResolvedMetricSourcePolicy,
    ResolvedMetricTarget,
    ResolvedStackedMetricSlot,
    ResolvedStackedMetricWidget,
} from "../../settings/resolved-settings";
import {
    resolveDiskMetricSubscriptionKeys,
    resolveDiskUsageMetricSubscriptionKeys,
} from "../disk/metric-subscriptions";
import { resolveNetworkMetricSubscriptionKeys } from "../network/metric-subscriptions";
import { resolveCustomHttpMetricDefinition } from "../custom-metric/runtime-source-definition";
import { resolveSystemMetricKeys } from "../system/view-builder";

export type StackedMetricSlotReadState =
    | StackedMetricConfiguredSlotReadState
    | StackedMetricUnconfiguredSlotReadState;

export interface StackedMetricConfiguredSlotReadState {
    readonly stateKind: "configured";
    readonly slotId: string;
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
    readonly sourcePolicy: ResolvedMetricSourcePolicy;
    readonly customHttpIdentity?: CustomHttpRuntimeIdentity | undefined;
}

export interface StackedMetricUnconfiguredSlotReadState {
    readonly stateKind: "unconfigured";
    readonly slotId: string;
    readonly reason: "emptyCatalogMetric" | "emptyCustomMetric" | "conflictingSourcePolicy";
}

export interface StackedMetricReadPlanResolution {
    readonly readPlan: MetricReadPlan;
    readonly slots: readonly StackedMetricSlotReadState[];
}

/**
 * Builds the shared collection read plan for every configured stacked slot.
 *
 * `actionId` is optional only for tests and static PI previews. Runtime callers
 * must pass it so Custom HTTP slots can derive action-local metric keys.
 */
export function buildStackedMetricReadPlan(options: {
    readonly widget: ResolvedStackedMetricWidget;
    readonly actionId?: string | undefined;
    readonly platform?: NodeJS.Platform;
}): StackedMetricReadPlanResolution {
    const acceptedRouteByMetricKey = new Map<string, MetricReadRoute>();
    const resolvedSlots: StackedMetricSlotReadState[] = [];

    for (const slot of options.widget.slots) {
        const configuredSlot = resolveConfiguredStackedSlot(slot, options.actionId);
        if (configuredSlot.stateKind === "unconfigured") {
            resolvedSlots.push(configuredSlot);
            continue;
        }

        const slotReadPlan = buildStackedSlotReadPlan(configuredSlot, options.platform);
        if (slotReadPlan.metrics.some(route => hasConflictingAcceptedRoute(acceptedRouteByMetricKey, route))) {
            resolvedSlots.push({
                stateKind: "unconfigured",
                slotId: configuredSlot.slotId,
                reason: "conflictingSourcePolicy",
            });
            continue;
        }

        for (const route of slotReadPlan.metrics) {
            if (!acceptedRouteByMetricKey.has(route.metricKey)) {
                acceptedRouteByMetricKey.set(route.metricKey, route);
            }
        }
        resolvedSlots.push(configuredSlot);
    }

    return {
        readPlan: normalizeMetricReadPlan({ metrics: [...acceptedRouteByMetricKey.values()] }),
        slots: resolvedSlots,
    };
}

/**
 * Lists every metric key the stacked action subscribes to.
 */
export function listStackedMetricReadPlanKeys(resolution: StackedMetricReadPlanResolution): readonly string[] {
    return listMetricReadPlanKeys(resolution.readPlan);
}

/**
 * Reads the displayed metric key for the currently active stacked slot.
 */
export function readStackedDisplayedMetricKey(
    resolution: StackedMetricReadPlanResolution,
    slotId: string,
): string | undefined {
    const slot = resolution.slots.find(candidateSlot => candidateSlot.slotId === slotId);

    return slot?.stateKind === "configured" ? slot.displayMetricKey : undefined;
}

function resolveConfiguredStackedSlot(
    slot: ResolvedStackedMetricSlot,
    actionId: string | undefined,
): StackedMetricSlotReadState {
    const target = slot.widget.slot.metric.target;

    if (target.domain === "catalog" && target.metricId.length === 0) {
        return {
            stateKind: "unconfigured",
            slotId: slot.slotId,
            reason: "emptyCatalogMetric",
        };
    }
    const metricKeys = resolveStackedMetricKeys(target, slot.widget.slot.appearance.view.selectedView, actionId, slot.slotId);
    if (metricKeys === undefined) {
        return {
            stateKind: "unconfigured",
            slotId: slot.slotId,
            reason: "emptyCustomMetric",
        };
    }

    return {
        stateKind: "configured",
        slotId: slot.slotId,
        displayMetricKey: metricKeys.displayMetricKey,
        subscriptionMetricKeys: metricKeys.subscriptionMetricKeys,
        sourcePolicy: slot.widget.slot.metric.source,
        customHttpIdentity: metricKeys.customHttpIdentity,
    };
}

function resolveStackedMetricKeys(
    target: ResolvedMetricTarget,
    selectedView: ResolvedStackedMetricSlot["widget"]["slot"]["appearance"]["view"]["selectedView"],
    actionId: string | undefined,
    slotId: string,
): {
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
    readonly customHttpIdentity?: CustomHttpRuntimeIdentity | undefined;
} | undefined {
    switch (target.domain) {
        case "cpu":
            switch (target.reading.kind) {
                case "usage":
                    return buildStackedMetricKeys([CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY]);
                case "temperature":
                    return buildStackedMetricKeys([CPU_TEMP_METRIC_KEY]);
                case "power":
                    return buildStackedMetricKeys([CPU_POWER_METRIC_KEY]);
            }
            return assertNever(target.reading);
        case "gpu":
            switch (target.reading.kind) {
                case "usage":
                    return buildStackedMetricKeys([GPU_USAGE_METRIC_KEY, GPU_MODEL_METRIC_KEY]);
                case "temperature":
                    return buildStackedMetricKeys([GPU_TEMP_METRIC_KEY]);
                case "vram":
                    return buildStackedMetricKeys([GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY]);
                case "power":
                    return buildStackedMetricKeys([GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY]);
            }
            return assertNever(target.reading);
        case "memory":
            return buildStackedMetricKeys([RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY]);
        case "disk":
            return buildStackedMetricKeys(target.reading.kind === "throughput"
                ? resolveDiskMetricSubscriptionKeys({
                    diskMetricKind: target.reading.kind,
                    diskThroughputDirection: target.reading.direction,
                })
                : resolveDiskUsageMetricSubscriptionKeys(target.volumeId));
        case "network":
            return buildStackedMetricKeys(resolveNetworkMetricSubscriptionKeys({
                selectedView,
                reading: target.reading,
            }));
        case "system":
            return buildStackedMetricKeys(resolveSystemMetricKeys(target));
        case "catalog":
            return buildStackedMetricKeys([target.metricId]);
        case "customMetric": {
            if (actionId === undefined) {
                return undefined;
            }
            const definition = resolveCustomHttpMetricDefinition({
                target,
                actionId,
                consumerSlug: buildStackedCustomHttpConsumerSlug(slotId),
            });
            return definition === undefined
                ? undefined
                : {
                    displayMetricKey: definition.identity.metricKey,
                    subscriptionMetricKeys: [definition.identity.metricKey],
                    customHttpIdentity: definition.identity,
                };
        }
    }
}

function assertNever(value: never): never {
    throw new Error(`Unexpected stacked metric target reading: ${JSON.stringify(value)}`);
}

function hasConflictingAcceptedRoute(
    acceptedRouteByMetricKey: ReadonlyMap<string, MetricReadRoute>,
    route: MetricReadRoute,
): boolean {
    const acceptedRoute = acceptedRouteByMetricKey.get(route.metricKey);

    return acceptedRoute !== undefined && buildRouteIdentity(acceptedRoute) !== buildRouteIdentity(route);
}

function buildRouteIdentity(route: MetricReadRoute): string {
    return JSON.stringify([
        route.metricKey,
        route.sourceScopeId,
        route.failureMode,
        route.sourceCandidates.map(sourceCandidate => sourceCandidate.sourceId),
    ]);
}

function buildStackedMetricKeys(metricKeys: readonly string[]): {
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
} {
    const displayMetricKey = metricKeys[0];
    if (displayMetricKey === undefined) {
        throw new Error("Stacked metric key resolution returned no metric keys.");
    }

    return {
        displayMetricKey,
        subscriptionMetricKeys: metricKeys,
    };
}

function buildStackedSlotReadPlan(
    slot: StackedMetricConfiguredSlotReadState,
    platform: NodeJS.Platform | undefined,
): MetricReadPlan {
    if (slot.customHttpIdentity !== undefined) {
        return buildCustomHttpMetricReadPlan([slot.customHttpIdentity]);
    }

    return buildMetricReadPlanFromSourcePolicy({
        metricKeys: slot.subscriptionMetricKeys,
        sourcePolicy: slot.sourcePolicy,
        defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
        platform,
    });
}

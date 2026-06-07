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
import { buildMetricReadPlanFromSourcePolicy } from "../../runtime/source-routing/metric-read-plan-builder";
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

export type StackedMetricSlotReadState =
    | StackedMetricConfiguredSlotReadState
    | StackedMetricUnconfiguredSlotReadState;

export interface StackedMetricConfiguredSlotReadState {
    readonly stateKind: "configured";
    readonly slotId: string;
    readonly displayMetricKey: string;
    readonly subscriptionMetricKeys: readonly string[];
    readonly sourcePolicy: ResolvedMetricSourcePolicy;
}

export interface StackedMetricUnconfiguredSlotReadState {
    readonly stateKind: "unconfigured";
    readonly slotId: string;
    readonly reason: "emptyCatalogMetric" | "conflictingSourcePolicy";
}

export interface StackedMetricReadPlanResolution {
    readonly readPlan: MetricReadPlan;
    readonly slots: readonly StackedMetricSlotReadState[];
}

export function buildStackedMetricReadPlan(options: {
    readonly widget: ResolvedStackedMetricWidget;
    readonly platform?: NodeJS.Platform;
}): StackedMetricReadPlanResolution {
    const acceptedRouteByMetricKey = new Map<string, MetricReadRoute>();
    const resolvedSlots: StackedMetricSlotReadState[] = [];

    for (const slot of options.widget.slots) {
        const configuredSlot = resolveConfiguredStackedSlot(slot);
        if (configuredSlot.stateKind === "unconfigured") {
            resolvedSlots.push(configuredSlot);
            continue;
        }

        const slotReadPlan = buildMetricReadPlanFromSourcePolicy({
            metricKeys: configuredSlot.subscriptionMetricKeys,
            sourcePolicy: configuredSlot.sourcePolicy,
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: options.platform,
        });
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

export function listStackedMetricReadPlanKeys(resolution: StackedMetricReadPlanResolution): readonly string[] {
    return listMetricReadPlanKeys(resolution.readPlan);
}

export function readStackedDisplayedMetricKey(
    resolution: StackedMetricReadPlanResolution,
    slotId: string,
): string | undefined {
    const slot = resolution.slots.find(candidateSlot => candidateSlot.slotId === slotId);

    return slot?.stateKind === "configured" ? slot.displayMetricKey : undefined;
}

function resolveConfiguredStackedSlot(slot: ResolvedStackedMetricSlot): StackedMetricSlotReadState {
    const target = slot.widget.slot.metric.target;

    if (target.domain === "catalog" && target.metricId.length === 0) {
        return {
            stateKind: "unconfigured",
            slotId: slot.slotId,
            reason: "emptyCatalogMetric",
        };
    }

    const metricKeys = resolveStackedMetricKeys(target, slot.widget.slot.appearance.view.selectedView);

    return {
        stateKind: "configured",
        slotId: slot.slotId,
        displayMetricKey: metricKeys[0],
        subscriptionMetricKeys: metricKeys,
        sourcePolicy: slot.widget.slot.metric.source,
    };
}

function resolveStackedMetricKeys(
    target: ResolvedMetricTarget,
    selectedView: ResolvedStackedMetricSlot["widget"]["slot"]["appearance"]["view"]["selectedView"],
): readonly string[] {
    switch (target.domain) {
        case "cpu":
            switch (target.reading.kind) {
                case "usage":
                    return [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY];
                case "temperature":
                    return [CPU_TEMP_METRIC_KEY];
                case "power":
                    return [CPU_POWER_METRIC_KEY];
            }
            return assertNever(target.reading);
        case "gpu":
            switch (target.reading.kind) {
                case "usage":
                    return [GPU_USAGE_METRIC_KEY, GPU_MODEL_METRIC_KEY];
                case "temperature":
                    return [GPU_TEMP_METRIC_KEY];
                case "vram":
                    return [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY];
                case "power":
                    return [GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY];
            }
            return assertNever(target.reading);
        case "memory":
            return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
        case "disk":
            return target.reading.kind === "throughput"
                ? resolveDiskMetricSubscriptionKeys({
                    diskMetricKind: target.reading.kind,
                    diskThroughputDirection: target.reading.direction,
                })
                : resolveDiskUsageMetricSubscriptionKeys(target.volumeId);
        case "network":
            return resolveNetworkMetricSubscriptionKeys({
                selectedView,
                reading: target.reading,
            });
        case "catalog":
            return [target.metricId];
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

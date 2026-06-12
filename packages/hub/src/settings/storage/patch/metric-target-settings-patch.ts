import { create } from "@bufbuild/protobuf";
import {
    CustomHttpMetricSourceSchema,
    CustomMetricIconSettingsSchema,
    DiskThroughputDisplaySettingsSchema,
    MetricSourcePolicySchema,
    NetworkDisplaySettingsSchema,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_PingSchema,
    NetworkMetricTarget_TrafficSchema,
    SingleCustomHttpRequestSchema,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type CustomMetricTarget as StoredCustomMetricTarget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricSelection as StoredMetricSelection,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SlotOverrides as StoredSlotOverrides,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { normalizeNetworkPingTargetInput } from "../../network-ping-target";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedCpuMetricKindByResolved,
    storedDiskMetricKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedDiskUsageDisplayModeByResolved,
    storedGpuMetricKindByResolved,
    storedNetworkDirectionByResolved,
    storedNetworkMetricKindByResolved,
    storedNetworkTrafficDisplayModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedScaleModeByResolved,
    storedSourceFailureModeByResolved,
    storedTemperatureUnitByResolved,
} from "../enum-maps";
import type { StoredWidgetSettingsPatch } from "./widget-settings-patch-types";

export function applySourcePatch(
    metric: StoredMetricSelection,
    patch: NonNullable<StoredWidgetSettingsPatch["source"]>,
): void {
    const sourcePolicy = create(MetricSourcePolicySchema);

    sourcePolicy.primarySourceProfileId = patch.primarySourceProfileId;
    sourcePolicy.fallbackSourceProfileIds = [...patch.fallbackSourceProfileIds];
    sourcePolicy.failureMode = storedSourceFailureModeByResolved[patch.failureMode];
    metric.sourcePolicy = sourcePolicy;
}

export function applyCustomMetricPatch(
    target: StoredCustomMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["customMetric"]>,
): void {
    if ("iconId" in patch) {
        if (patch.iconId === undefined) {
            target.icon = undefined;
        } else {
            target.icon = create(CustomMetricIconSettingsSchema, {
                id: patch.iconId,
            });
        }
    }

    const hasHttpPatch = "url" in patch || "userIntent" in patch || "jqTransform" in patch;
    if (!hasHttpPatch) {
        return;
    }

    if (target.source.case !== "http") {
        target.source = {
            case: "http",
            value: create(CustomHttpMetricSourceSchema),
        };
    }

    const httpSource = target.source.value;
    if (httpSource.plan.case !== "singleRequest") {
        httpSource.plan = {
            case: "singleRequest",
            value: create(SingleCustomHttpRequestSchema),
        };
    }
    const request = httpSource.plan.value;

    if ("url" in patch) {
        request.url = patch.url;
    }
    if ("userIntent" in patch) {
        request.userIntent = patch.userIntent;
    }
    if ("jqTransform" in patch) {
        request.jqTransform = patch.jqTransform;
    }
}

export function applyNetworkPatch(
    target: StoredNetworkMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["network"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedNetworkMetricKindByResolved[patch.kind];
        if (patch.kind === "traffic") {
            target.traffic ??= create(NetworkMetricTarget_TrafficSchema);
            target.ping = undefined;
        } else {
            target.ping ??= create(NetworkMetricTarget_PingSchema);
            target.traffic = undefined;
        }
    }

    if (patch.direction !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.direction = storedNetworkDirectionByResolved[patch.direction];
    }
    if (patch.interfaceId !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.interfaceId = patch.interfaceId;
    }
    if (patch.trafficDisplayMode !== undefined) {
        const traffic = ensureNetworkTrafficTarget(target);
        traffic.trafficDisplayMode = storedNetworkTrafficDisplayModeByResolved[patch.trafficDisplayMode];
    }

    if (patch.pingTargetHost !== undefined) {
        target.kind = StoredNetworkMetricKind.PING;
        const ping = target.ping ??= create(NetworkMetricTarget_PingSchema);
        ping.targetHost = normalizeNetworkPingTargetInput(patch.pingTargetHost).targetHost;
    }

    if (target.kind === StoredNetworkMetricKind.PING || !hasNetworkDisplayPatch(patch)) {
        return;
    }

    const display = overrides.network ??= create(NetworkDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumDownloadSpeedMegabitsPerSecond" in patch) {
        display.maximumDownloadSpeedMegabitsPerSecond = patch.maximumDownloadSpeedMegabitsPerSecond;
    }
    if ("maximumUploadSpeedMegabitsPerSecond" in patch) {
        display.maximumUploadSpeedMegabitsPerSecond = patch.maximumUploadSpeedMegabitsPerSecond;
    }
    if (patch.unitBase !== undefined) {
        display.unitBase = storedNetworkUnitBaseByResolved[patch.unitBase];
    }
}

export function applyDiskPatch(
    target: StoredDiskMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["disk"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedDiskMetricKindByResolved[patch.kind];
    }
    applyDefinedValue(target, "volumeId", patch.volumeId);
    if (patch.throughputDirection !== undefined) {
        target.throughputDirection = storedDiskThroughputDirectionByResolved[patch.throughputDirection];
    }
    if (patch.usageDisplayMode !== undefined) {
        target.usageDisplayMode = storedDiskUsageDisplayModeByResolved[patch.usageDisplayMode];
    }
    applyDefinedValue(target, "barLabel", patch.barLabel);

    const display = overrides.diskThroughput ??= create(DiskThroughputDisplaySettingsSchema);

    if (patch.scaleMode !== undefined) {
        display.scaleMode = storedScaleModeByResolved[patch.scaleMode];
    }
    if ("maximumReadThroughputMebibytesPerSecond" in patch) {
        display.maximumReadThroughputMebibytesPerSecond = patch.maximumReadThroughputMebibytesPerSecond;
    }
    if ("maximumWriteThroughputMebibytesPerSecond" in patch) {
        display.maximumWriteThroughputMebibytesPerSecond = patch.maximumWriteThroughputMebibytesPerSecond;
    }
}

export function applyCpuPatch(
    target: StoredCpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["cpu"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedCpuMetricKindByResolved[patch.kind];
    }
    if (patch.temperatureUnit !== undefined) {
        target.temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    applyDefinedValue(target, "maximumTemperatureCelsius", patch.maximumTemperatureCelsius);
    if ("maximumPowerWatts" in patch) {
        target.maximumPowerWatts = patch.maximumPowerWatts;
    }
}

export function applyGpuPatch(
    target: StoredGpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["gpu"]>,
): void {
    if (patch.kind !== undefined) {
        target.kind = storedGpuMetricKindByResolved[patch.kind];
    }
    if (patch.temperatureUnit !== undefined) {
        target.temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    applyDefinedValue(target, "maximumTemperatureCelsius", patch.maximumTemperatureCelsius);
    if ("maximumPowerWatts" in patch) {
        target.maximumPowerWatts = patch.maximumPowerWatts;
    }
}

export function applyCatalogPatch(
    target: StoredCatalogMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["catalog"]>,
): void {
    if (patch.metricId !== undefined) {
        target.metricId = patch.metricId;
    }
    if ("detectedLabel" in patch) {
        target.detectedLabel = patch.detectedLabel;
    }
    if ("detectedUnit" in patch) {
        target.detectedUnit = patch.detectedUnit;
    }
    if ("detectedCategory" in patch) {
        target.detectedCategory = patch.detectedCategory === undefined
            ? undefined
            : storedCatalogMetricCategoryByResolved[patch.detectedCategory];
    }
    if ("detectedReadingKind" in patch) {
        target.detectedReadingKind = patch.detectedReadingKind === undefined
            ? undefined
            : storedCatalogMetricReadingKindByResolved[patch.detectedReadingKind];
    }
    if ("customLabel" in patch) {
        target.customLabel = patch.customLabel;
    }
    if ("customMaximumValue" in patch) {
        target.customMaximumValue = patch.customMaximumValue;
    }
}

function ensureNetworkTrafficTarget(
    target: StoredNetworkMetricTarget,
): NonNullable<StoredNetworkMetricTarget["traffic"]> {
    if (target.kind !== StoredNetworkMetricKind.TRAFFIC) {
        target.kind = StoredNetworkMetricKind.TRAFFIC;
        target.ping = undefined;
    }

    return target.traffic ??= create(NetworkMetricTarget_TrafficSchema);
}

function hasNetworkDisplayPatch(patch: NonNullable<StoredWidgetSettingsPatch["network"]>): boolean {
    return patch.scaleMode !== undefined
        || "maximumDownloadSpeedMegabitsPerSecond" in patch
        || "maximumUploadSpeedMegabitsPerSecond" in patch
        || patch.unitBase !== undefined;
}

function applyDefinedValue<TObject extends object, TKey extends keyof TObject>(
    object: TObject,
    key: TKey,
    value: TObject[TKey] | undefined,
): void {
    if (value !== undefined) {
        object[key] = value;
    }
}

import { create } from "@bufbuild/protobuf";
import {
    CustomHttpMetricSourceSchema,
    CustomHttpRequestAuthSchema,
    CustomHttpRequestSettingsSchema,
    CpuMetricTarget_PowerSchema,
    CpuMetricTarget_TemperatureSchema,
    CpuMetricTarget_UsageSchema,
    DiskThroughputDisplaySettingsSchema,
    DiskMetricTarget_ThroughputSchema,
    DiskMetricTarget_UsageSchema,
    GpuMetricTarget_PowerSchema,
    GpuMetricTarget_TemperatureSchema,
    GpuMetricTarget_UsageSchema,
    GpuMetricTarget_VramSchema,
    MetricIconSettingsSchema,
    MetricSourcePolicySchema,
    NetworkDisplaySettingsSchema,
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
    type NetworkMetricTarget_Ping as StoredNetworkPingTarget,
    type NetworkMetricTarget_Traffic as StoredNetworkTrafficTarget,
    type CpuMetricTarget_Power as StoredCpuPowerTarget,
    type CpuMetricTarget_Temperature as StoredCpuTemperatureTarget,
    type DiskMetricTarget_Throughput as StoredDiskThroughputTarget,
    type DiskMetricTarget_Usage as StoredDiskUsageTarget,
    type GpuMetricTarget_Power as StoredGpuPowerTarget,
    type GpuMetricTarget_Temperature as StoredGpuTemperatureTarget,
    type SlotOverrides as StoredSlotOverrides,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { normalizeNetworkPingTargetInput } from "../../network-ping-target";
import {
    storedCatalogMetricCategoryByResolved,
    storedCatalogMetricReadingKindByResolved,
    storedDiskThroughputDirectionByResolved,
    storedDiskUsageDisplayModeByResolved,
    storedNetworkDirectionByResolved,
    storedNetworkTrafficDisplayModeByResolved,
    storedNetworkUnitBaseByResolved,
    storedScaleModeByResolved,
    storedSourceFailureModeByResolved,
    storedTemperatureUnitByResolved,
} from "../resolved-to-stored-enum-maps";
import type { StoredWidgetSettingsPatch } from "./widget-settings-patch-types";

type StoredCpuReadingCase = NonNullable<StoredCpuMetricTarget["reading"]["case"]>;
type StoredDiskReadingCase = NonNullable<StoredDiskMetricTarget["reading"]["case"]>;
type StoredGpuReadingCase = NonNullable<StoredGpuMetricTarget["reading"]["case"]>;
type StoredNetworkReadingCase = NonNullable<StoredNetworkMetricTarget["reading"]["case"]>;

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
    if ("customIconId" in patch) {
        if (patch.customIconId === undefined) {
            target.customIcon = undefined;
        } else {
            target.customIcon = create(MetricIconSettingsSchema, {
                id: patch.customIconId,
            });
        }
    }

    if ("customLabel" in patch) {
        target.customLabel = patch.customLabel;
    }

    const hasHttpPatch = "url" in patch
        || "userIntent" in patch
        || "jqTransform" in patch
        || "timeoutSeconds" in patch
        || "retryCount" in patch
        || "credentialId" in patch
        || "allowPublicHttpCredentials" in patch;
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
    if ("timeoutSeconds" in patch || "retryCount" in patch) {
        request.requestSettings ??= create(CustomHttpRequestSettingsSchema);
        if ("timeoutSeconds" in patch) {
            request.requestSettings.timeoutSeconds = patch.timeoutSeconds;
        }
        if ("retryCount" in patch) {
            request.requestSettings.retryCount = patch.retryCount;
        }
    }
    if ("credentialId" in patch || "allowPublicHttpCredentials" in patch) {
        request.auth ??= create(CustomHttpRequestAuthSchema);
        if ("credentialId" in patch) {
            request.auth.credentialId = patch.credentialId;
        }
        if ("allowPublicHttpCredentials" in patch) {
            request.auth.allowPublicHttpCredentials = patch.allowPublicHttpCredentials;
        }
        if (
            request.auth.credentialId === undefined
            && request.auth.allowPublicHttpCredentials === undefined
        ) {
            request.auth = undefined;
        }
    }
}

export function applyNetworkPatch(
    target: StoredNetworkMetricTarget,
    overrides: StoredSlotOverrides,
    patch: NonNullable<StoredWidgetSettingsPatch["network"]>,
): void {
    if (patch.kind !== undefined) {
        target.reading = buildNetworkReadingPatch(patch.kind);
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
        const ping = ensureNetworkPingTarget(target);
        ping.targetHost = normalizeNetworkPingTargetInput(patch.pingTargetHost).targetHost;
    }

    if (target.reading.case === "ping" || !hasNetworkDisplayPatch(patch)) {
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
        target.reading = buildDiskReadingPatch(patch.kind);
    }
    if (patch.volumeId !== undefined) {
        ensureDiskUsageTarget(target).volumeId = patch.volumeId;
    }
    if (patch.throughputDirection !== undefined) {
        ensureDiskThroughputTarget(target).direction =
            storedDiskThroughputDirectionByResolved[patch.throughputDirection];
    }
    if (patch.usageDisplayMode !== undefined) {
        ensureDiskUsageTarget(target).displayMode = storedDiskUsageDisplayModeByResolved[patch.usageDisplayMode];
    }
    if (patch.barLabel !== undefined) {
        ensureDiskUsageTarget(target).barLabel = patch.barLabel;
    }

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
    // PI controls send coherent per-reading patches. If another caller mixes
    // fields from multiple reading arms in one patch, the later arm write wins.
    if (patch.kind !== undefined) {
        target.reading = buildCpuReadingPatch(patch.kind);
    }
    if (patch.temperatureUnit !== undefined) {
        ensureCpuTemperatureTarget(target).temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    if (patch.maximumTemperatureCelsius !== undefined) {
        ensureCpuTemperatureTarget(target).maximumTemperatureCelsius = patch.maximumTemperatureCelsius;
    }
    if ("maximumPowerWatts" in patch) {
        ensureCpuPowerTarget(target).maximumPowerWatts = patch.maximumPowerWatts;
    }
}

export function applyGpuPatch(
    target: StoredGpuMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["gpu"]>,
): void {
    // PI controls send coherent per-reading patches. If another caller mixes
    // fields from multiple reading arms in one patch, the later arm write wins.
    if (patch.kind !== undefined) {
        target.reading = buildGpuReadingPatch(patch.kind);
    }
    if (patch.temperatureUnit !== undefined) {
        ensureGpuTemperatureTarget(target).temperatureUnit = storedTemperatureUnitByResolved[patch.temperatureUnit];
    }
    if (patch.maximumTemperatureCelsius !== undefined) {
        ensureGpuTemperatureTarget(target).maximumTemperatureCelsius = patch.maximumTemperatureCelsius;
    }
    if ("maximumPowerWatts" in patch) {
        ensureGpuPowerTarget(target).maximumPowerWatts = patch.maximumPowerWatts;
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
    if ("customIconId" in patch) {
        target.customIcon = patch.customIconId === undefined
            ? undefined
            : create(MetricIconSettingsSchema, { id: patch.customIconId });
    }
}

function ensureNetworkTrafficTarget(
    target: StoredNetworkMetricTarget,
): StoredNetworkTrafficTarget {
    if (target.reading.case === "traffic") {
        return target.reading.value;
    }

    const value = create(NetworkMetricTarget_TrafficSchema);
    target.reading = { case: "traffic", value };
    return value;
}

function ensureNetworkPingTarget(
    target: StoredNetworkMetricTarget,
): StoredNetworkPingTarget {
    if (target.reading.case === "ping") {
        return target.reading.value;
    }

    const value = create(NetworkMetricTarget_PingSchema);
    target.reading = { case: "ping", value };
    return value;
}

function buildNetworkReadingPatch(kind: StoredNetworkReadingCase): StoredNetworkMetricTarget["reading"] {
    switch (kind) {
        case "traffic":
            return { case: "traffic", value: create(NetworkMetricTarget_TrafficSchema) };
        case "ping":
            return { case: "ping", value: create(NetworkMetricTarget_PingSchema) };
    }

    return assertNever(kind);
}

function buildCpuReadingPatch(kind: StoredCpuReadingCase): StoredCpuMetricTarget["reading"] {
    switch (kind) {
        case "usage":
            return { case: "usage", value: create(CpuMetricTarget_UsageSchema) };
        case "temperature":
            return { case: "temperature", value: create(CpuMetricTarget_TemperatureSchema) };
        case "power":
            return { case: "power", value: create(CpuMetricTarget_PowerSchema) };
    }

    return assertNever(kind);
}

function ensureCpuTemperatureTarget(
    target: StoredCpuMetricTarget,
): StoredCpuTemperatureTarget {
    if (target.reading.case === "temperature") {
        return target.reading.value;
    }

    const value = create(CpuMetricTarget_TemperatureSchema);
    target.reading = { case: "temperature", value };
    return value;
}

function ensureCpuPowerTarget(
    target: StoredCpuMetricTarget,
): StoredCpuPowerTarget {
    if (target.reading.case === "power") {
        return target.reading.value;
    }

    const value = create(CpuMetricTarget_PowerSchema);
    target.reading = { case: "power", value };
    return value;
}

function buildGpuReadingPatch(kind: StoredGpuReadingCase): StoredGpuMetricTarget["reading"] {
    switch (kind) {
        case "usage":
            return { case: "usage", value: create(GpuMetricTarget_UsageSchema) };
        case "temperature":
            return { case: "temperature", value: create(GpuMetricTarget_TemperatureSchema) };
        case "vram":
            return { case: "vram", value: create(GpuMetricTarget_VramSchema) };
        case "power":
            return { case: "power", value: create(GpuMetricTarget_PowerSchema) };
    }

    return assertNever(kind);
}

function ensureGpuTemperatureTarget(
    target: StoredGpuMetricTarget,
): StoredGpuTemperatureTarget {
    if (target.reading.case === "temperature") {
        return target.reading.value;
    }

    const value = create(GpuMetricTarget_TemperatureSchema);
    target.reading = { case: "temperature", value };
    return value;
}

function ensureGpuPowerTarget(
    target: StoredGpuMetricTarget,
): StoredGpuPowerTarget {
    if (target.reading.case === "power") {
        return target.reading.value;
    }

    const value = create(GpuMetricTarget_PowerSchema);
    target.reading = { case: "power", value };
    return value;
}

function ensureDiskUsageTarget(
    target: StoredDiskMetricTarget,
): StoredDiskUsageTarget {
    if (target.reading.case === "usage") {
        return target.reading.value;
    }

    const value = create(DiskMetricTarget_UsageSchema);
    target.reading = { case: "usage", value };
    return value;
}

function ensureDiskThroughputTarget(
    target: StoredDiskMetricTarget,
): StoredDiskThroughputTarget {
    if (target.reading.case === "throughput") {
        return target.reading.value;
    }

    const value = create(DiskMetricTarget_ThroughputSchema);
    target.reading = { case: "throughput", value };
    return value;
}

function buildDiskReadingPatch(kind: StoredDiskReadingCase): StoredDiskMetricTarget["reading"] {
    switch (kind) {
        case "usage":
            return { case: "usage", value: create(DiskMetricTarget_UsageSchema) };
        case "throughput":
            return { case: "throughput", value: create(DiskMetricTarget_ThroughputSchema) };
    }

    return assertNever(kind);
}

function hasNetworkDisplayPatch(patch: NonNullable<StoredWidgetSettingsPatch["network"]>): boolean {
    return patch.scaleMode !== undefined
        || "maximumDownloadSpeedMegabitsPerSecond" in patch
        || "maximumUploadSpeedMegabitsPerSecond" in patch
        || patch.unitBase !== undefined;
}

function assertNever(value: never): never {
    throw new Error(`Unexpected stored metric target reading case: ${JSON.stringify(value)}`);
}

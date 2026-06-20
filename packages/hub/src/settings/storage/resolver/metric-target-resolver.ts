import {
    CatalogMetricCategory as StoredCatalogMetricCategory,
    CatalogMetricReadingKind as StoredCatalogMetricReadingKind,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    DiskMetricTarget_ThroughputDirection as StoredDiskThroughputDirection,
    DiskMetricTarget_UsageDisplayMode as StoredDiskUsageDisplayMode,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    NetworkMetricTarget_Traffic_TrafficDisplayMode as StoredNetworkTrafficDisplayMode,
    SystemPeripheralBindingTransport as StoredSystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind as StoredSystemPeripheralReceiverKind,
    TemperatureUnit as StoredTemperatureUnit,
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type CustomHttpMetricSource as StoredCustomHttpMetricSource,
    type CustomMetricTarget as StoredCustomMetricTarget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MetricSelection as StoredMetricSelection,
    type MetricSourcePolicy as StoredMetricSourcePolicy,
    type NetworkMetricTarget as StoredNetworkMetricTarget,
    type SystemBatteryMetricTarget as StoredSystemBatteryMetricTarget,
    type SystemMetricTarget as StoredSystemMetricTarget,
    type SystemPeripheralIdentity as StoredSystemPeripheralIdentity,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import {
    resolveCustomHttpFetchPolicy,
} from "../../../runtime/sources/custom-http/custom-http-request-policy";
import { normalizeCustomHttpSourceUrlInput } from "../../../runtime/sources/custom-http/custom-http-url";
import { MetricUnit } from "../../../runtime/sources/metric-source";
import {
    DEFAULT_NETWORK_PING_TARGET_HOST,
    normalizeNetworkPingTargetInput,
} from "../../network-ping-target";
import type {
    CatalogMetricCategory,
    CatalogMetricReadingKind,
    CustomMetricInvalidReason,
    DiskThroughputDirection,
    DiskUsageDisplayMode,
    NetworkDirection,
    NetworkTrafficDisplayMode,
    ResolvedCatalogMetricTarget,
    ResolvedCustomMetricSource,
    ResolvedCustomMetricTarget,
    ResolvedSingleCustomHttpRequest,
    ResolvedDiskReading,
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGpuReading,
    ResolvedMemoryReading,
    ResolvedMetric,
    ResolvedMetricSourcePolicy,
    ResolvedMetricTarget,
    ResolvedNetworkDisplaySettings,
    ResolvedNetworkReading,
    ResolvedSystemPeripheralIdentity,
    SourceFailureMode,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
    TemperatureUnit,
} from "../../resolved-settings";
import type { ResolveStoredSettingsRuntimeContext } from "./resolver-types";
import { readPositiveRuntimeMaximum } from "./display-settings-resolver";
import {
    resolveStoredEnum,
    throwUnexpectedStoredSettingsState,
} from "./resolver-helpers";

const DEFAULT_CPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_CPU_POWER_WATTS = 150;
const DEFAULT_GPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_GPU_POWER_WATTS = 300;

const sourceFailureModeByProto = {
    [StoredSourceFailureMode.UNSPECIFIED]: undefined,
    [StoredSourceFailureMode.SHOW_UNAVAILABLE]: "showUnavailable",
    [StoredSourceFailureMode.USE_FALLBACK]: "useFallback",
} satisfies Record<StoredSourceFailureMode, SourceFailureMode | undefined>;

const temperatureUnitByProto = {
    [StoredTemperatureUnit.UNSPECIFIED]: undefined,
    [StoredTemperatureUnit.CELSIUS]: "celsius",
    [StoredTemperatureUnit.FAHRENHEIT]: "fahrenheit",
} satisfies Record<StoredTemperatureUnit, TemperatureUnit | undefined>;

const networkDirectionByProto = {
    [StoredNetworkDirection.UNSPECIFIED]: undefined,
    [StoredNetworkDirection.BOTH]: "both",
    [StoredNetworkDirection.DOWNLOAD]: "download",
    [StoredNetworkDirection.UPLOAD]: "upload",
} satisfies Record<StoredNetworkDirection, NetworkDirection | undefined>;

const networkMetricKindByProto = {
    [StoredNetworkMetricKind.UNSPECIFIED]: undefined,
    [StoredNetworkMetricKind.TRAFFIC]: "traffic",
    [StoredNetworkMetricKind.PING]: "ping",
} satisfies Record<StoredNetworkMetricKind, ResolvedNetworkReading["kind"] | undefined>;

const networkTrafficDisplayModeByProto = {
    [StoredNetworkTrafficDisplayMode.UNSPECIFIED]: undefined,
    [StoredNetworkTrafficDisplayMode.MIRRORED]: "mirrored",
    [StoredNetworkTrafficDisplayMode.OVERLAY]: "overlay",
} satisfies Record<StoredNetworkTrafficDisplayMode, NetworkTrafficDisplayMode | undefined>;

const catalogMetricCategoryByProto = {
    [StoredCatalogMetricCategory.UNSPECIFIED]: "unspecified",
    [StoredCatalogMetricCategory.CPU]: "cpu",
    [StoredCatalogMetricCategory.GPU]: "gpu",
    [StoredCatalogMetricCategory.MEMORY]: "memory",
    [StoredCatalogMetricCategory.DISK]: "disk",
    [StoredCatalogMetricCategory.NETWORK]: "network",
    [StoredCatalogMetricCategory.OTHER]: "other",
} satisfies Record<StoredCatalogMetricCategory, CatalogMetricCategory>;

const catalogMetricReadingKindByProto = {
    [StoredCatalogMetricReadingKind.UNSPECIFIED]: "unspecified",
    [StoredCatalogMetricReadingKind.USAGE]: "usage",
    [StoredCatalogMetricReadingKind.TEMPERATURE]: "temperature",
    [StoredCatalogMetricReadingKind.POWER]: "power",
    [StoredCatalogMetricReadingKind.CLOCK]: "clock",
    [StoredCatalogMetricReadingKind.FAN]: "fan",
    [StoredCatalogMetricReadingKind.VOLTAGE]: "voltage",
    [StoredCatalogMetricReadingKind.CURRENT]: "current",
    [StoredCatalogMetricReadingKind.DATA]: "data",
    [StoredCatalogMetricReadingKind.THROUGHPUT]: "throughput",
    [StoredCatalogMetricReadingKind.TIMING]: "timing",
    [StoredCatalogMetricReadingKind.LEVEL]: "level",
    [StoredCatalogMetricReadingKind.CONTROL]: "control",
    [StoredCatalogMetricReadingKind.OTHER]: "other",
} satisfies Record<StoredCatalogMetricReadingKind, CatalogMetricReadingKind>;

const diskUsageDisplayModeByProto = {
    [StoredDiskUsageDisplayMode.UNSPECIFIED]: undefined,
    [StoredDiskUsageDisplayMode.PERCENTAGE]: "percentage",
    [StoredDiskUsageDisplayMode.SPACE]: "space",
} satisfies Record<StoredDiskUsageDisplayMode, DiskUsageDisplayMode | undefined>;

const diskThroughputDirectionByProto = {
    [StoredDiskThroughputDirection.UNSPECIFIED]: undefined,
    [StoredDiskThroughputDirection.BOTH]: "both",
    [StoredDiskThroughputDirection.READ]: "read",
    [StoredDiskThroughputDirection.WRITE]: "write",
} satisfies Record<StoredDiskThroughputDirection, DiskThroughputDirection | undefined>;

export function resolveMetricSelection(
    storedMetricSelection: StoredMetricSelection | undefined,
    networkDisplay: ResolvedNetworkDisplaySettings,
    diskThroughputDisplay: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetric {
    return {
        source: resolveMetricSourcePolicy(storedMetricSelection?.sourcePolicy),
        target: resolveMetricTarget(
            storedMetricSelection,
            networkDisplay,
            diskThroughputDisplay,
            runtime,
        ),
    };
}

function resolveMetricTarget(
    storedMetricSelection: StoredMetricSelection | undefined,
    networkDisplay: ResolvedNetworkDisplaySettings,
    diskThroughputDisplay: ResolvedDiskThroughputDisplaySettings,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricTarget {
    switch (storedMetricSelection?.target.case) {
        case "cpu":
            return resolveCpuMetricTarget(storedMetricSelection.target.value);
        case "memory":
            return resolveMemoryMetricTarget(storedMetricSelection.target.value.kind);
        case "network":
            return resolveNetworkMetricTarget(storedMetricSelection.target.value, networkDisplay);
        case "disk":
            return resolveDiskMetricTarget(storedMetricSelection.target.value, diskThroughputDisplay);
        case "gpu":
            return resolveGpuMetricTarget(storedMetricSelection.target.value, runtime);
        case "system":
            return resolveSystemMetricTarget(storedMetricSelection.target.value);
        case "catalog":
            return resolveCatalogMetricTarget(storedMetricSelection.target.value);
        case "custom":
            return resolveCustomMetricTarget(storedMetricSelection.target.value);
        case undefined:
            return resolveCpuMetricTarget(undefined);
    }
}

function resolveSystemMetricTarget(
    storedTarget: StoredSystemMetricTarget,
): ResolvedMetricTarget {
    switch (storedTarget.reading.case) {
        case "battery":
            return resolveSystemBatteryMetricTarget(storedTarget.reading.value);
        case undefined:
            return resolveSystemBatteryMetricTarget(undefined);
    }
}

function resolveSystemBatteryMetricTarget(
    storedTarget: StoredSystemBatteryMetricTarget | undefined,
): ResolvedMetricTarget {
    return {
        domain: "system",
        reading: {
            kind: "batteryPercent",
            peripheralIdentity: resolveSystemPeripheralIdentity(storedTarget?.peripheralIdentity),
            detectedPeripheralDisplayName: normalizeOptionalText(storedTarget?.detectedPeripheralDisplayName),
        },
    };
}

function resolveSystemPeripheralIdentity(
    storedIdentity: StoredSystemPeripheralIdentity | undefined,
): ResolvedSystemPeripheralIdentity | undefined {
    if (!storedIdentity) {
        return undefined;
    }

    return {
        vendorId: storedIdentity.vendorId,
        productId: storedIdentity.productId,
        manufacturer: normalizeOptionalText(storedIdentity.manufacturer),
        productName: normalizeOptionalText(storedIdentity.productName),
        serialNumber: normalizeOptionalText(storedIdentity.serialNumber),
        interfaceNumber: storedIdentity.interfaceNumber,
        usagePage: storedIdentity.usagePage,
        usageId: storedIdentity.usageId,
        bindingTransport: resolveSystemPeripheralBindingTransport(storedIdentity.bindingTransport),
        receiverKind: resolveSystemPeripheralReceiverKind(storedIdentity.receiverKind),
        vendorUnitId: normalizeOptionalText(storedIdentity.vendorUnitId),
        modelId: normalizeOptionalText(storedIdentity.modelId),
        receiverSlot: storedIdentity.receiverSlot,
    };
}

function resolveSystemPeripheralBindingTransport(
    storedTransport: StoredSystemPeripheralBindingTransport | undefined,
): SystemPeripheralBindingTransport | undefined {
    switch (storedTransport) {
        case StoredSystemPeripheralBindingTransport.BLUETOOTH:
            return "bluetooth";
        case StoredSystemPeripheralBindingTransport.USB_RECEIVER:
            return "usbReceiver";
        case StoredSystemPeripheralBindingTransport.USB_WIRED:
            return "usbWired";
        case StoredSystemPeripheralBindingTransport.UNSPECIFIED:
            return undefined;
    }
}

function resolveSystemPeripheralReceiverKind(
    storedReceiverKind: StoredSystemPeripheralReceiverKind | undefined,
): SystemPeripheralReceiverKind | undefined {
    switch (storedReceiverKind) {
        case StoredSystemPeripheralReceiverKind.UNKNOWN_RECEIVER:
            return "unknownReceiver";
        case StoredSystemPeripheralReceiverKind.BOLT:
            return "bolt";
        case StoredSystemPeripheralReceiverKind.UNIFYING:
            return "unifying";
        case StoredSystemPeripheralReceiverKind.ROG_OMNI:
            return "rogOmni";
        case StoredSystemPeripheralReceiverKind.LIGHTSPEED:
            return "lightspeed";
        case StoredSystemPeripheralReceiverKind.UNSPECIFIED:
            return undefined;
    }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
}

function resolveCpuMetricTarget(
    storedTarget: StoredCpuMetricTarget | undefined,
): ResolvedMetricTarget {
    switch (storedTarget?.kind) {
        case StoredCpuMetricKind.TEMPERATURE:
            return {
                domain: "cpu",
                reading: {
                    kind: "temperature",
                    maximumCelsius: storedTarget?.maximumTemperatureCelsius ?? DEFAULT_CPU_TEMPERATURE_CELSIUS,
                    unit: resolveStoredEnum(storedTarget?.temperatureUnit, temperatureUnitByProto, "celsius"),
                },
            };
        case StoredCpuMetricKind.POWER:
            return {
                domain: "cpu",
                reading: {
                    kind: "power",
                    maximumWatts: storedTarget?.maximumPowerWatts ?? DEFAULT_CPU_POWER_WATTS,
                },
            };
        case StoredCpuMetricKind.USAGE:
        case undefined:
            return {
                domain: "cpu",
                reading: { kind: "usage" },
            };
        case StoredCpuMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected CPU metric kind after protovalidate.");
    }
}

function resolveMemoryMetricTarget(kind: StoredMemoryMetricKind | undefined): ResolvedMetricTarget {
    switch (kind) {
        case StoredMemoryMetricKind.USAGE:
        case undefined:
            return {
                domain: "memory",
                reading: { kind: "usage" } satisfies ResolvedMemoryReading,
            };
        case StoredMemoryMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected memory metric kind after protovalidate.");
    }
}

function resolveNetworkMetricTarget(
    storedTarget: StoredNetworkMetricTarget,
    display: ResolvedNetworkDisplaySettings,
): ResolvedMetricTarget {
    return {
        domain: "network",
        reading: resolveNetworkReading(storedTarget, display),
    };
}

function resolveNetworkReading(
    storedTarget: StoredNetworkMetricTarget,
    display: ResolvedNetworkDisplaySettings,
): ResolvedNetworkReading {
    const kind = resolveStoredEnum(storedTarget.kind, networkMetricKindByProto, "traffic");

    switch (kind) {
        case "ping":
            return {
                kind: "ping",
                // Stored settings may be hand-edited or recovered from stale JSON.
                // The patch writer stores normalized hosts; the resolver keeps this boundary safe.
                targetHost: normalizeNetworkPingTargetInput(
                    storedTarget.ping?.targetHost ?? DEFAULT_NETWORK_PING_TARGET_HOST,
                ).targetHost,
            };
        case "traffic":
            return {
                kind: "traffic",
                interfaceId: storedTarget.traffic?.interfaceId,
                direction: resolveStoredEnum(storedTarget.traffic?.direction, networkDirectionByProto, "both"),
                trafficDisplayMode: resolveStoredEnum(
                    storedTarget.traffic?.trafficDisplayMode,
                    networkTrafficDisplayModeByProto,
                    "mirrored",
                ),
                display,
            };
    }
}

function resolveDiskMetricTarget(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
): ResolvedMetricTarget {
    return {
        domain: "disk",
        volumeId: storedTarget.volumeId,
        reading: resolveDiskReading(storedTarget, display),
    };
}

function resolveDiskReading(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
): ResolvedDiskReading {
    switch (storedTarget.kind) {
        case StoredDiskMetricKind.THROUGHPUT:
            return {
                kind: "throughput",
                direction: resolveStoredEnum(
                    storedTarget.throughputDirection,
                    diskThroughputDirectionByProto,
                    "both",
                ),
                display,
            };
        case StoredDiskMetricKind.USAGE:
        case undefined:
            return {
                kind: "usage",
                displayMode: resolveStoredEnum(
                    storedTarget.usageDisplayMode,
                    diskUsageDisplayModeByProto,
                    "percentage",
                ),
                barLabel: storedTarget.barLabel ?? "",
            };
        case StoredDiskMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected disk metric kind after protovalidate.");
    }
}

function resolveGpuMetricTarget(
    storedTarget: StoredGpuMetricTarget,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedMetricTarget {
    return {
        domain: "gpu",
        gpuId: storedTarget.gpuId,
        reading: resolveGpuReading(storedTarget, runtime),
    };
}

function resolveGpuReading(
    storedTarget: StoredGpuMetricTarget,
    runtime: ResolveStoredSettingsRuntimeContext | undefined,
): ResolvedGpuReading {
    switch (storedTarget.kind) {
        case StoredGpuMetricKind.TEMPERATURE:
            return {
                kind: "temperature",
                maximumCelsius: storedTarget.maximumTemperatureCelsius ?? DEFAULT_GPU_TEMPERATURE_CELSIUS,
                unit: resolveStoredEnum(storedTarget.temperatureUnit, temperatureUnitByProto, "celsius"),
            };
        case StoredGpuMetricKind.VRAM:
            return { kind: "vram" };
        case StoredGpuMetricKind.POWER:
            return {
                kind: "power",
                maximumWatts: resolveGpuPowerMaximumWatts(
                    storedTarget.maximumPowerWatts,
                    runtime?.runtimeMaximumGpuPowerWatts,
                ),
            };
        case StoredGpuMetricKind.USAGE:
        case undefined:
            return { kind: "usage" };
        case StoredGpuMetricKind.UNSPECIFIED:
            return throwUnexpectedStoredSettingsState("Unexpected GPU metric kind after protovalidate.");
    }
}

function resolveCatalogMetricTarget(storedTarget: StoredCatalogMetricTarget): ResolvedCatalogMetricTarget {
    return {
        domain: "catalog",
        metricId: storedTarget.metricId ?? "",
        detectedLabel: storedTarget.detectedLabel,
        detectedUnit: storedTarget.detectedUnit ?? MetricUnit.UNSPECIFIED,
        detectedCategory: resolveStoredEnum(
            storedTarget.detectedCategory,
            catalogMetricCategoryByProto,
            "unspecified",
        ),
        detectedReadingKind: resolveStoredEnum(
            storedTarget.detectedReadingKind,
            catalogMetricReadingKindByProto,
            "unspecified",
        ),
        customLabel: storedTarget.customLabel,
        customMaximumValue: storedTarget.customMaximumValue,
    };
}

function resolveCustomMetricTarget(storedTarget: StoredCustomMetricTarget): ResolvedCustomMetricTarget {
    const iconId = storedTarget.icon?.id?.trim() || undefined;
    switch (storedTarget.source.case) {
        case undefined:
            return {
                domain: "customMetric",
                iconId,
                configuration: { state: "unconfigured" },
            };
        case "http":
            return resolveCustomHttpMetricSource(storedTarget.source.value, iconId);
    }

    return assertNever(storedTarget.source);
}

function resolveCustomHttpMetricSource(
    storedHttpSource: StoredCustomHttpMetricSource,
    iconId: string | undefined,
): ResolvedCustomMetricTarget {
    const request = readSingleCustomHttpRequest(storedHttpSource);
    if (request === undefined) {
        return {
            domain: "customMetric",
            iconId,
            configuration: { state: "unconfigured" },
        };
    }

    const invalidReason = readCustomMetricInvalidReason(request);
    const source: ResolvedCustomMetricSource = {
        kind: "http",
        plan: {
            kind: "singleRequest",
            request,
        },
    };
    if (invalidReason !== undefined) {
        return {
            domain: "customMetric",
            iconId,
            configuration: {
                state: "invalid",
                reason: invalidReason,
                source,
            },
        };
    }

    return {
        domain: "customMetric",
        iconId,
        configuration: {
            state: "configured",
            source,
        },
    };
}

function readSingleCustomHttpRequest(
    storedHttpSource: StoredCustomHttpMetricSource,
): ResolvedSingleCustomHttpRequest | undefined {
    switch (storedHttpSource.plan.case) {
        case undefined:
            return undefined;
        case "singleRequest": {
            const storedRequest = storedHttpSource.plan.value;
            const url = normalizeCustomHttpSourceUrlInput(storedRequest.url ?? "");
            const userIntent = storedRequest.userIntent?.trim() || undefined;
            const jqTransform = storedRequest.jqTransform?.trim() ?? "";
            const hasRequestSettings = storedRequest.requestSettings !== undefined;
            const hasAuth = storedRequest.auth !== undefined;

            if (
                url.length === 0
                && userIntent === undefined
                && jqTransform.length === 0
                && !hasRequestSettings
                && !hasAuth
            ) {
                return undefined;
            }

            return {
                url,
                userIntent,
                jqTransform,
                requestSettings: resolveCustomHttpFetchPolicy({
                    timeoutSeconds: storedRequest.requestSettings?.timeoutSeconds,
                    retryCount: storedRequest.requestSettings?.retryCount,
                }),
                auth: {
                    credentialId: storedRequest.auth?.credentialId?.trim() || undefined,
                    allowPublicHttpCredentials: storedRequest.auth?.allowPublicHttpCredentials === true,
                },
            };
        }
    }

    return assertNever(storedHttpSource.plan);
}

function readCustomMetricInvalidReason(
    request: ResolvedSingleCustomHttpRequest,
): CustomMetricInvalidReason | undefined {
    if (request.url.length === 0) {
        return "missingUrl";
    }
    if (request.jqTransform.length === 0) {
        return "missingJqTransform";
    }

    return undefined;
}

function assertNever(value: never): never {
    throw new Error(`Unexpected Custom Metric stored settings branch: ${JSON.stringify(value)}`);
}

function resolveMetricSourcePolicy(
    storedSourcePolicy: StoredMetricSourcePolicy | undefined,
): ResolvedMetricSourcePolicy {
    return {
        primarySourceProfileId: storedSourcePolicy?.primarySourceProfileId,
        fallbackSourceProfileIds: [...(storedSourcePolicy?.fallbackSourceProfileIds ?? [])],
        failureMode: resolveStoredEnum(
            storedSourcePolicy?.failureMode,
            sourceFailureModeByProto,
            "showUnavailable",
        ),
    };
}

function resolveGpuPowerMaximumWatts(
    configuredMaximum: number | undefined,
    runtimeMaximum: number | undefined,
): number {
    return configuredMaximum
        ?? readPositiveRuntimeMaximum(runtimeMaximum)
        ?? DEFAULT_GPU_POWER_WATTS;
}

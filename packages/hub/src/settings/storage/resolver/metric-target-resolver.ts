import {
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MemoryMetricTarget_Kind as StoredMemoryMetricKind,
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
    SystemPeripheralIdentity_BluetoothIdentity_Identifier_Kind as StoredBluetoothIdentifierKind,
    type SystemPeripheralIdentity_BluetoothIdentity_Identifier as StoredBluetoothIdentifier,
    type SystemPeripheralIdentity_VendorHidIdentity as StoredVendorHidIdentity,
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
    CustomMetricInvalidReason,
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
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemBluetoothPeripheralIdentifierKind,
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemPeripheralIdentityEvidence,
    ResolvedSystemVendorHidPeripheralIdentity,
} from "../../resolved-settings";
import type { ResolveStoredSettingsRuntimeContext } from "./resolver-types";
import { readPositiveRuntimeMaximum } from "./display-settings-resolver";
import {
    resolveOptionalProtoEnum,
    resolveProtoEnum,
    throwUnexpectedStoredSettingsState,
} from "./resolver-helpers";
import {
    catalogMetricCategoryByProto,
    catalogMetricReadingKindByProto,
    diskThroughputDirectionByProto,
    diskUsageDisplayModeByProto,
    networkDirectionByProto,
    networkMetricKindByProto,
    networkTrafficDisplayModeByProto,
    sourceFailureModeByProto,
    systemPeripheralBindingTransportByProto,
    systemPeripheralReceiverKindByProto,
    temperatureUnitByProto,
} from "./stored-to-resolved-enum-maps";

const DEFAULT_CPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_CPU_POWER_WATTS = 150;
const DEFAULT_GPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_GPU_POWER_WATTS = 300;

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

    const evidence = resolveSystemPeripheralIdentityEvidence(storedIdentity);
    return evidence === undefined ? undefined : { evidence };
}

function resolveSystemPeripheralIdentityEvidence(
    storedIdentity: StoredSystemPeripheralIdentity,
): ResolvedSystemPeripheralIdentityEvidence | undefined {
    switch (storedIdentity.evidence.case) {
        case "vendorHidIdentity":
            return resolveSystemVendorHidPeripheralIdentity(storedIdentity.evidence.value);
        case "bluetoothIdentity":
            return {
                kind: "bluetooth",
                primaryIdentifier: resolveSystemBluetoothPeripheralIdentifier(
                    storedIdentity.evidence.value.primaryIdentifier,
                ),
                fallbackIdentifier: resolveSystemBluetoothPeripheralIdentifier(
                    storedIdentity.evidence.value.fallbackIdentifier,
                ),
            };
        case undefined:
            return undefined;
    }
}

function resolveSystemVendorHidPeripheralIdentity(
    storedIdentity: StoredVendorHidIdentity,
): ResolvedSystemVendorHidPeripheralIdentity {
    return {
        kind: "vendorHid",
        vendorId: storedIdentity.vendorId,
        productId: storedIdentity.productId,
        manufacturer: normalizeOptionalText(storedIdentity.manufacturer),
        productName: normalizeOptionalText(storedIdentity.productName),
        serialNumber: normalizeOptionalText(storedIdentity.serialNumber),
        interfaceNumber: storedIdentity.interfaceNumber,
        usagePage: storedIdentity.usagePage,
        usageId: storedIdentity.usageId,
        bindingTransport: resolveOptionalProtoEnum(
            storedIdentity.bindingTransport,
            systemPeripheralBindingTransportByProto,
        ),
        receiverKind: resolveOptionalProtoEnum(storedIdentity.receiverKind, systemPeripheralReceiverKindByProto),
        vendorUnitId: normalizeOptionalText(storedIdentity.vendorUnitId),
        modelId: normalizeOptionalText(storedIdentity.modelId),
        receiverSlot: storedIdentity.receiverSlot,
    };
}

function resolveSystemBluetoothPeripheralIdentifier(
    storedIdentifier: StoredBluetoothIdentifier | undefined,
): ResolvedSystemBluetoothPeripheralIdentifier | undefined {
    const kind = storedIdentifier === undefined
        ? undefined
        : systemBluetoothIdentifierKindByProto[storedIdentifier.kind];
    const hash = normalizeOptionalText(storedIdentifier?.hash);
    return kind === undefined || hash === undefined
        ? undefined
        : { kind, hash };
}

const systemBluetoothIdentifierKindByProto: Partial<
    Record<StoredBluetoothIdentifierKind, ResolvedSystemBluetoothPeripheralIdentifierKind>
> = {
    [StoredBluetoothIdentifierKind.PLATFORM_INSTANCE_ID]: "platformInstanceId",
    [StoredBluetoothIdentifierKind.WINDOWS_AEP_ADDRESS]: "windowsAepAddress",
    [StoredBluetoothIdentifierKind.BLUETOOTH_DEVICE_ADDRESS]: "bluetoothDeviceAddress",
};

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
                    unit: resolveProtoEnum(storedTarget?.temperatureUnit, temperatureUnitByProto, "celsius"),
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
    const kind = resolveProtoEnum(storedTarget.kind, networkMetricKindByProto, "traffic");

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
                direction: resolveProtoEnum(storedTarget.traffic?.direction, networkDirectionByProto, "both"),
                trafficDisplayMode: resolveProtoEnum(
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
                direction: resolveProtoEnum(
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
                displayMode: resolveProtoEnum(
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
                unit: resolveProtoEnum(storedTarget.temperatureUnit, temperatureUnitByProto, "celsius"),
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
        detectedCategory: resolveProtoEnum(
            storedTarget.detectedCategory,
            catalogMetricCategoryByProto,
            "unspecified",
        ),
        detectedReadingKind: resolveProtoEnum(
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
        failureMode: resolveProtoEnum(
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

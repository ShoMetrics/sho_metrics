import {
    type CatalogMetricTarget as StoredCatalogMetricTarget,
    type CustomHttpMetricSource as StoredCustomHttpMetricSource,
    type CustomMetricTarget as StoredCustomMetricTarget,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type DiskMetricTarget as StoredDiskMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
    type MemoryMetricTarget as StoredMemoryMetricTarget,
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
} from "./resolver-helpers";
import {
    catalogMetricCategoryByProto,
    catalogMetricReadingKindByProto,
    diskThroughputDirectionByProto,
    diskUsageDisplayModeByProto,
    networkDirectionByProto,
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
            return resolveMemoryMetricTarget(storedMetricSelection.target.value);
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
    if (storedTarget === undefined) {
        return {
            domain: "cpu",
            reading: { kind: "usage" },
        };
    }

    const { reading } = storedTarget;
    const readingCase = reading.case;

    switch (readingCase) {
        case "temperature":
            return {
                domain: "cpu",
                reading: {
                    kind: "temperature",
                    maximumCelsius: reading.value.maximumTemperatureCelsius
                        ?? DEFAULT_CPU_TEMPERATURE_CELSIUS,
                    unit: resolveProtoEnum(reading.value.temperatureUnit, temperatureUnitByProto, "celsius"),
                },
            };
        case "power":
            return {
                domain: "cpu",
                reading: {
                    kind: "power",
                    maximumWatts: reading.value.maximumPowerWatts ?? DEFAULT_CPU_POWER_WATTS,
                },
            };
        case "usage":
        case undefined:
            return {
                domain: "cpu",
                reading: { kind: "usage" },
            };
    }

    return assertNever(readingCase);
}

function resolveMemoryMetricTarget(storedTarget: StoredMemoryMetricTarget): ResolvedMetricTarget {
    const { reading } = storedTarget;
    const readingCase = reading.case;

    switch (readingCase) {
        case "usage":
        case undefined:
            return {
                domain: "memory",
                reading: { kind: "usage" } satisfies ResolvedMemoryReading,
            };
    }

    return assertNever(readingCase);
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
    const { reading } = storedTarget;
    const readingCase = reading.case;

    switch (readingCase) {
        case "ping":
            return {
                kind: "ping",
                // Stored settings may be hand-edited or recovered from stale JSON.
                // The patch writer stores normalized hosts; the resolver keeps this boundary safe.
                targetHost: normalizeNetworkPingTargetInput(
                    reading.value.targetHost ?? DEFAULT_NETWORK_PING_TARGET_HOST,
                ).targetHost,
            };
        case "traffic":
            return {
                kind: "traffic",
                interfaceId: reading.value.interfaceId,
                direction: resolveProtoEnum(reading.value.direction, networkDirectionByProto, "both"),
                trafficDisplayMode: resolveProtoEnum(
                    reading.value.trafficDisplayMode,
                    networkTrafficDisplayModeByProto,
                    "mirrored",
                ),
                display,
            };
        case undefined:
            return {
                kind: "traffic",
                interfaceId: undefined,
                direction: "both",
                trafficDisplayMode: "mirrored",
                display,
            };
    }

    return assertNever(readingCase);
}

function resolveDiskMetricTarget(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
): ResolvedMetricTarget {
    const usage = storedTarget.reading.case === "usage" ? storedTarget.reading.value : undefined;

    return {
        domain: "disk",
        volumeId: usage?.volumeId,
        reading: resolveDiskReading(storedTarget, display),
    };
}

function resolveDiskReading(
    storedTarget: StoredDiskMetricTarget,
    display: ResolvedDiskThroughputDisplaySettings,
): ResolvedDiskReading {
    const { reading } = storedTarget;
    const readingCase = reading.case;

    switch (readingCase) {
        case "throughput":
            return {
                kind: "throughput",
                direction: resolveProtoEnum(
                    reading.value.direction,
                    diskThroughputDirectionByProto,
                    "both",
                ),
                display,
            };
        case "usage":
        case undefined: {
            const usage = readingCase === "usage" ? reading.value : undefined;
            return {
                kind: "usage",
                displayMode: resolveProtoEnum(
                    usage?.displayMode,
                    diskUsageDisplayModeByProto,
                    "percentage",
                ),
                barLabel: usage?.barLabel ?? "",
            };
        }
    }

    return assertNever(readingCase);
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
    const { reading } = storedTarget;
    const readingCase = reading.case;

    switch (readingCase) {
        case "temperature":
            return {
                kind: "temperature",
                maximumCelsius: reading.value.maximumTemperatureCelsius ?? DEFAULT_GPU_TEMPERATURE_CELSIUS,
                unit: resolveProtoEnum(reading.value.temperatureUnit, temperatureUnitByProto, "celsius"),
            };
        case "vram":
            return { kind: "vram" };
        case "power":
            return {
                kind: "power",
                maximumWatts: resolveGpuPowerMaximumWatts(
                    reading.value.maximumPowerWatts,
                    runtime?.runtimeMaximumGpuPowerWatts,
                ),
            };
        case "usage":
        case undefined:
            return { kind: "usage" };
    }

    return assertNever(readingCase);
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

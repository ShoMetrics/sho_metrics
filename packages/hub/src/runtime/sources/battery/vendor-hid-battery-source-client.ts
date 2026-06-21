import { logger } from "../../../logging/logger";
import { pluginGlobalSettingsStore } from "../../../settings/global-settings-store";
import { wallClockNowMilliseconds } from "../../../shared/clock";
import { isBatteryMetricKey, SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../../metric-keys";
import { buildMetricSnapshot, buildScalarMetricValue, MetricUnit, type MetricValue } from "../metric-source";
import type { NativeHidLoadResult, NativeHidModule } from "../battery-hid/native-hid-loader-internal";
import { AsusRogBatteryDeviceDiscoverer } from "../battery-hid/asus-rog/asus-rog-battery-discovery";
import { LogitechBatteryDeviceDiscoverer } from "../battery-hid/logitech/battery-discovery/logitech-battery-discovery";
import { VENDOR_HID_BATTERY_SOURCE_ID } from "../source-ids";
import type {
    MetricUnavailableReport,
    SourceClient,
    SourceClientStatus,
    SourceMetricValueMetadata,
    SourceSnapshotReadResult,
} from "../source-client";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";
import type {
    BatteryDeviceDescriptor,
} from "./battery-device-descriptor";
import {
    type BatteryDeviceDiscoverer,
    type BatteryDeviceDiscoveryCandidate,
    resolveBatteryDeviceDescriptors,
} from "./battery-device-discovery";

const log = logger.for("Source:BatteryHID");
const VENDOR_HID_BATTERY_POLLING_GROUP_ID = "vendor-hid-battery";
const VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS = 60_000;

interface VendorHidBatteryDiscoveryResult {
    readonly descriptors: readonly BatteryDeviceDescriptor[];
    readonly candidates: readonly BatteryDeviceDiscoveryCandidate[];
}

interface VendorHidBatterySourceClientOptions {
    readonly loadNativeHid?: () => NativeHidLoadResult | Promise<NativeHidLoadResult>;
    readonly isExperimentalVendorHidEnabled?: () => boolean;
    readonly wallClockNow?: () => number;
    readonly discoverCandidates?: (nativeHidModule: NativeHidModule) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}

/**
 * Polls experimental vendor HID battery readers and publishes only real battery scalar values.
 *
 * Unavailable native drivers, disabled experimental support, discovery failures, and missing per-device reads are
 * reported as unavailable metrics instead of placeholder scalar values so the metric store can retain the last known
 * battery value without poisoning it with fake data.
 */
export class VendorHidBatterySourceClient implements SourceClient {
    readonly sourceId = VENDOR_HID_BATTERY_SOURCE_ID;

    private readonly loadNativeHid: () => NativeHidLoadResult | Promise<NativeHidLoadResult>;
    private readonly isExperimentalVendorHidEnabled: () => boolean;
    private readonly wallClockNow: () => number;
    private readonly discoverCandidates: (nativeHidModule: NativeHidModule) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
    private status: SourceClientStatus = { state: "unknown" };

    constructor(options: VendorHidBatterySourceClientOptions = {}) {
        this.loadNativeHid = options.loadNativeHid ?? loadNativeHidModule;
        this.isExperimentalVendorHidEnabled = options.isExperimentalVendorHidEnabled
            ?? (() => pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled);
        this.wallClockNow = options.wallClockNow ?? wallClockNowMilliseconds;
        this.discoverCandidates = options.discoverCandidates ?? discoverVendorHidBatteryCandidates;
    }

    resolveMetricPollingGroups(
        metricKeys: readonly string[],
    ): ReadonlyMap<string, SourceMetricPollingGroupResolution> {
        return new Map(metricKeys.map(metricKey => [
            metricKey,
            isVendorHidBatteryMetricKey(metricKey)
                ? { state: "owned", pollingGroupId: VENDOR_HID_BATTERY_POLLING_GROUP_ID }
                : { state: "unsupported" },
        ]));
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<SourceSnapshotReadResult> {
        const snapshotTimestampMilliseconds = this.wallClockNow();
        const requestedMetricKeys = metricKeys.filter(isVendorHidBatteryMetricKey);
        if (requestedMetricKeys.length === 0) {
            return buildSourceSnapshotReadResult(snapshotTimestampMilliseconds, {}, [], []);
        }

        if (!this.isExperimentalVendorHidEnabled()) {
            this.status = { state: "unsupported" };
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }

        // The native HID addon is optional. Loading failures belong to this source, not the whole plugin runtime.
        const nativeHidLoadResult = await this.loadNativeHid();
        if (nativeHidLoadResult.state === "unavailable") {
            this.recordUnavailableStatus("driverUnavailable", snapshotTimestampMilliseconds, nativeHidLoadResult.error);
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }

        let discoveryResult: VendorHidBatteryDiscoveryResult;
        try {
            // Battery polling is low frequency, so each poll does a fresh HID discovery/read pass instead of holding
            // device handles or sharing mutable route state with the Property Inspector descriptor picker.
            discoveryResult = await discoverVendorHidBatteryDevices({
                nativeHidModule: nativeHidLoadResult.module,
                discoverCandidates: this.discoverCandidates,
                isExperimentalVendorHidEnabled: true,
            });
        } catch (error) {
            this.recordUnavailableStatus("sourceError", snapshotTimestampMilliseconds, error);
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }

        const metrics: Record<string, MetricValue> = {};
        const valueMetadata: SourceMetricValueMetadata[] = [];
        const unavailableMetrics: MetricUnavailableReport[] = [];
        // Descriptors are the stable binding surface; candidates are this poll's live routes/readings.
        const candidatesById = new Map(discoveryResult.candidates.map(candidate => [candidate.candidateId, candidate]));
        const descriptorByMetricKey = new Map(discoveryResult.descriptors.map(descriptor => [descriptor.metricKey, descriptor]));

        for (const metricKey of requestedMetricKeys) {
            const descriptor = descriptorByMetricKey.get(metricKey);
            const candidate = descriptor === undefined
                ? undefined
                : selectDescriptorBatteryCandidate(descriptor, candidatesById);
            if (descriptor === undefined || candidate?.batteryPercent === undefined) {
                // Do not emit 0 or a sentinel scalar; no-data must leave any retained battery value intact.
                unavailableMetrics.push(...buildUnavailableReports([metricKey], descriptor));
                continue;
            }

            metrics[metricKey] = buildScalarMetricValue(candidate.batteryPercent, {
                unit: MetricUnit.PERCENT,
            });
            valueMetadata.push({
                metricId: metricKey,
                valueFreshness: "fresh",
                rawSensorIdentity: buildBatteryRawSensorIdentity(descriptor),
                displayHint: {
                    label: descriptor.displayName,
                    unit: MetricUnit.PERCENT,
                    maximum: 100,
                },
            });
        }

        this.status = {
            state: "available",
            lastSuccessAtTimestampMilliseconds: snapshotTimestampMilliseconds,
        };
        return buildSourceSnapshotReadResult(snapshotTimestampMilliseconds, metrics, valueMetadata, unavailableMetrics);
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    private recordUnavailableStatus(
        reason: NonNullable<SourceClientStatus["reason"]>,
        timestampMilliseconds: number,
        error: unknown,
    ): void {
        this.status = {
            state: "unavailable",
            reason,
            lastFailureAtTimestampMilliseconds: timestampMilliseconds,
            lastErrorMessage: error instanceof Error ? error.message : String(error),
        };
        log.atWarn()
            .everyMs(`vendor-hid-battery:${reason}`, VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "Vendor HID battery source unavailable",
                `reason=${reason}`,
                `error=${this.status.lastErrorMessage ?? ""}`,
            ].join(" "));
    }
}

/**
 * Reads available vendor HID battery descriptors for the Property Inspector device picker.
 *
 * This is a live HID discovery pass. It intentionally does not reuse the runtime poll result yet, so opening the picker
 * during a battery poll can briefly duplicate HID opens against the same path.
 */
export async function readVendorHidBatteryDeviceDescriptors(options: {
    readonly isExperimentalVendorHidEnabled: boolean;
    readonly loadNativeHid?: () => NativeHidLoadResult | Promise<NativeHidLoadResult>;
    readonly discoverCandidates?: (nativeHidModule: NativeHidModule) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}): Promise<readonly BatteryDeviceDescriptor[]> {
    if (!options.isExperimentalVendorHidEnabled) {
        return [];
    }

    const nativeHidLoadResult = await (options.loadNativeHid ?? loadNativeHidModule)();
    if (nativeHidLoadResult.state === "unavailable") {
        log.atWarn()
            .everyMs("vendor-hid-battery:descriptor-load", VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "Vendor HID battery descriptor discovery unavailable",
                `error=${nativeHidLoadResult.error instanceof Error ? nativeHidLoadResult.error.message : String(nativeHidLoadResult.error)}`,
            ].join(" "));
        return [];
    }

    const discoveryResult = await discoverVendorHidBatteryDevices({
        nativeHidModule: nativeHidLoadResult.module,
        discoverCandidates: options.discoverCandidates ?? discoverVendorHidBatteryCandidates,
        isExperimentalVendorHidEnabled: options.isExperimentalVendorHidEnabled,
    });
    return discoveryResult.descriptors;
}

async function loadNativeHidModule(): Promise<NativeHidLoadResult> {
    try {
        // Keep import.meta.url in the ESM wrapper so native package resolution stays anchored to the loader module.
        const nativeHidLoaderModule: unknown = await import("../battery-hid/native-hid-loader.mjs");
        if (!isNativeHidLoaderModule(nativeHidLoaderModule)) {
            return {
                state: "unavailable",
                error: new TypeError("Native HID loader module did not export loadNativeHidModule()."),
            };
        }

        return nativeHidLoaderModule.loadNativeHidModule();
    } catch (error) {
        return { state: "unavailable", error };
    }
}

function isNativeHidLoaderModule(value: unknown): value is {
    loadNativeHidModule(): NativeHidLoadResult;
} {
    return typeof value === "object" &&
        value !== null &&
        "loadNativeHidModule" in value &&
        typeof value.loadNativeHidModule === "function";
}

async function discoverVendorHidBatteryDevices(options: {
    readonly nativeHidModule: NativeHidModule;
    readonly discoverCandidates: (nativeHidModule: NativeHidModule) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
    readonly isExperimentalVendorHidEnabled: boolean;
}): Promise<VendorHidBatteryDiscoveryResult> {
    const candidates = await options.discoverCandidates(options.nativeHidModule);
    const descriptors = resolveBatteryDeviceDescriptors(candidates, {
        isExperimentalVendorHidEnabled: options.isExperimentalVendorHidEnabled,
    });

    return { descriptors, candidates };
}

async function discoverVendorHidBatteryCandidates(
    nativeHidModule: NativeHidModule,
): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
    const discoverers: readonly BatteryDeviceDiscoverer[] = [
        new LogitechBatteryDeviceDiscoverer(nativeHidModule),
        new AsusRogBatteryDeviceDiscoverer(nativeHidModule),
    ];
    const candidateLists = await Promise.all(
        discoverers.map(discoverer => discoverer.discoverBatteryDevices()),
    );

    return candidateLists.flat();
}

function selectDescriptorBatteryCandidate(
    descriptor: BatteryDeviceDescriptor,
    candidatesById: ReadonlyMap<string, BatteryDeviceDiscoveryCandidate>,
): BatteryDeviceDiscoveryCandidate | undefined {
    // A coalesced descriptor can point at several routes; use the first route that produced a battery reading.
    return descriptor.diagnostics?.candidateIds
        .map(candidateId => candidatesById.get(candidateId))
        .find(candidate => candidate?.batteryPercent !== undefined);
}

function buildSourceSnapshotReadResult(
    timestampMilliseconds: number,
    metrics: Record<string, MetricValue>,
    valueMetadata: readonly SourceMetricValueMetadata[],
    unavailableMetrics: readonly MetricUnavailableReport[],
): SourceSnapshotReadResult {
    return {
        snapshot: buildMetricSnapshot({ timestampMilliseconds, metrics }),
        valueMetadata,
        unavailableMetrics,
    };
}

function buildUnavailableReports(
    metricKeys: readonly string[],
    descriptor: BatteryDeviceDescriptor | undefined,
): readonly MetricUnavailableReport[] {
    return metricKeys.map(metricId => ({
        metricId,
        reason: "noSourceReading",
        ...(descriptor === undefined ? {} : { rawSensorIdentity: buildBatteryRawSensorIdentity(descriptor) }),
    }));
}

function buildBatteryRawSensorIdentity(descriptor: BatteryDeviceDescriptor): SourceMetricValueMetadata["rawSensorIdentity"] {
    return {
        sourceSensorId: descriptor.descriptorId,
        hardwareId: descriptor.identity?.vendorUnitId ?? descriptor.identity?.modelId ?? descriptor.descriptorId,
        hardwareType: "Peripheral",
        sensorName: "Battery",
        sourceSensorType: "Battery",
        hardwareName: descriptor.displayName,
    };
}

function isVendorHidBatteryMetricKey(metricKey: string): boolean {
    return isBatteryMetricKey(metricKey) && metricKey !== SYSTEM_BATTERY_PERCENT_METRIC_KEY;
}

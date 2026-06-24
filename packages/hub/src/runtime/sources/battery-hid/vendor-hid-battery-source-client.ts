import { logger } from "../../../logging/logger";
import { pluginGlobalSettingsStore } from "../../../settings/global-settings-store";
import { readSystemVendorHidPeripheralIdentity } from "../../../settings/resolved-settings";
import { monotonicNowMilliseconds, wallClockNowMilliseconds } from "../../../shared/clock";
import { isVendorHidBatteryMetricKey as isRuntimeVendorHidBatteryMetricKey } from "../../metric-keys";
import { buildMetricSnapshot, buildScalarMetricValue, MetricUnit, type MetricValue } from "../metric-source";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidLoadResult,
    NativeHidModule,
} from "./native-hid-loader-internal";
import { loadNativeHidModule } from "./native-hid-loader";
import { AsusRogBatteryReader } from "./asus-rog/asus-rog-battery-discovery";
import { LogitechBatteryReader } from "./logitech/battery-discovery/logitech-battery-discovery";
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
    BatteryDeviceDiscoveryDiagnostics,
} from "../battery/battery-device-descriptor";
import {
    buildBatteryDeviceDiscoveryDiagnostics,
    type BatteryDeviceDiscoveryCandidate,
    resolveBatteryDeviceDescriptors,
} from "../battery/battery-device-discovery";
import { buildBatteryMetricKeyFromIdentity } from "../battery/battery-metric-key";
import type { VendorHidBatteryReader } from "./vendor-hid-battery-reader";
import {
    vendorHidBatteryRouteRegistry,
    type VendorHidBatteryRouteDefinition,
    type VendorHidBatteryRouteRegistry,
} from "./vendor-hid-battery-route-registry";
import {
    vendorHidOperationMutex,
    type VendorHidOperationMutex,
} from "./vendor-hid-operation-mutex";

const log = logger.for("Source:BatteryHID");
const VENDOR_HID_BATTERY_POLLING_GROUP_ID = "vendor-hid-battery";
const VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS = 60_000;
const VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 30_000;
// Broad HID discovery can overlap Stream Deck's first image-upload burst after plugin reload.
// Local Stream Deck XL testing showed host-side "Upload Image Ignore error: FAILED" events
// concentrated in that startup window when native HID enumeration/open/query ran at the same time.
// This delay is not a correctness delay for battery data; it is a USB contention mitigation that
// lets first-render key images leave before vendor HID discovery starts. The measured failure rate
// is non-monotonic, so this value is a UX tradeoff, not a proof that 500ms is uniquely safe.
// Image-delivery bandwidth reduction remains the other half of the mitigation.
const VENDOR_HID_DISCOVERY_STARTUP_DELAY_MILLISECONDS = 500;
const VENDOR_HID_DEFERRED_FULL_DISCOVERY_DELAY_MILLISECONDS = 10_000;

type VendorHidBatteryDiscoveryOrigin = "poll" | "descriptor" | "deferred" | "selectedRoute";

interface VendorHidBatteryDiscoveryResult {
    readonly descriptors: readonly BatteryDeviceDescriptor[];
    readonly candidates: readonly BatteryDeviceDiscoveryCandidate[];
    readonly diagnostics: BatteryDeviceDiscoveryDiagnostics;
}

export interface VendorHidBatteryDeviceDescriptorSnapshot {
    readonly descriptors: readonly BatteryDeviceDescriptor[];
    readonly diagnostics: BatteryDeviceDiscoveryDiagnostics;
}

interface VendorHidBatterySourceClientOptions {
    readonly loadNativeHid?: () => NativeHidLoadResult | Promise<NativeHidLoadResult>;
    readonly isExperimentalVendorHidEnabled?: () => boolean;
    readonly wallClockNow?: () => number;
    readonly createReaders?: (nativeHidModule: NativeHidModule) => readonly VendorHidBatteryReaderEntry[];
    readonly routeRegistry?: VendorHidBatteryRouteRegistry;
    readonly operationMutex?: VendorHidOperationMutex;
    readonly deferredFullDiscoveryDelayMilliseconds?: number;
    readonly discoverCandidates?: (
        nativeHidModule: NativeHidModule,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}

export interface VendorHidBatteryReaderEntry {
    readonly name: string;
    readonly reader: VendorHidBatteryReader;
}

interface VendorHidBatteryDiscoveryNativeDiagnostics {
    readonly passId: number;
    deviceEnumerationCalls: number;
    deviceEnumerationDurationMilliseconds: number;
    lastEnumeratedDeviceCount: number | undefined;
    hidOpenCalls: number;
    hidOpenDurationMilliseconds: number;
}

let vendorHidBatteryDiscoveryPassSequence = 0;

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
    private readonly discoverCandidates: (
        nativeHidModule: NativeHidModule,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
    private readonly createReaders: (nativeHidModule: NativeHidModule) => readonly VendorHidBatteryReaderEntry[];
    private readonly routeRegistry: VendorHidBatteryRouteRegistry;
    private readonly operationMutex: VendorHidOperationMutex;
    private readonly deferredFullDiscoveryDelayMilliseconds: number;
    private readonly usesInjectedCandidateDiscovery: boolean;
    private readerEntries: readonly VendorHidBatteryReaderEntry[] | undefined;
    private descriptorByMetricKey = new Map<string, BatteryDeviceDescriptor>();
    private status: SourceClientStatus = { state: "unknown" };
    private deferredFullDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;
    private deferredFullDiscoveryPromise: Promise<void> | undefined;

    constructor(options: VendorHidBatterySourceClientOptions = {}) {
        this.loadNativeHid = options.loadNativeHid ?? loadNativeHidModule;
        this.isExperimentalVendorHidEnabled = options.isExperimentalVendorHidEnabled
            ?? (() => pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled);
        this.wallClockNow = options.wallClockNow ?? wallClockNowMilliseconds;
        this.createReaders = options.createReaders ?? createVendorHidBatteryReaders;
        this.routeRegistry = options.routeRegistry ?? vendorHidBatteryRouteRegistry;
        this.operationMutex = options.operationMutex ?? vendorHidOperationMutex;
        this.deferredFullDiscoveryDelayMilliseconds = options.deferredFullDiscoveryDelayMilliseconds
            ?? VENDOR_HID_DEFERRED_FULL_DISCOVERY_DELAY_MILLISECONDS;
        this.usesInjectedCandidateDiscovery = options.discoverCandidates !== undefined;
        this.discoverCandidates = options.discoverCandidates ?? ((nativeHidModule, deviceInfoList) =>
            discoverVendorHidBatteryCandidatesFromReaders(
                this.resolveReaderEntries(nativeHidModule),
                deviceInfoList,
            ));
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
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
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

        const selectedReadResult = this.usesInjectedCandidateDiscovery
            ? undefined
            : await this.readSelectedBatteryDevices(
                requestedMetricKeys,
                snapshotTimestampMilliseconds,
                0,
                startedAtMonotonicMilliseconds,
            );
        if (selectedReadResult !== undefined) {
            return selectedReadResult;
        }

        const routeDefinitions = this.readRouteDefinitions(requestedMetricKeys);
        if (!this.usesInjectedCandidateDiscovery && routeDefinitions.length === 0) {
            this.scheduleDeferredFullDiscovery();
            logVendorHidPollDiagnostic({
                outcome: "deferredDiscovery",
                requestedMetricCount: requestedMetricKeys.length,
                candidateCount: 0,
                descriptorCount: 0,
                emittedMetricCount: 0,
                unavailableMetricCount: requestedMetricKeys.length,
                nativeLoadDurationMilliseconds: 0,
                discoveryDurationMilliseconds: 0,
                totalDurationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
            });
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }

        // The native HID addon is optional. Loading failures belong to this source, not the whole plugin runtime.
        const nativeLoadStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const nativeHidLoadResult = await this.loadNativeHid();
        const nativeLoadDurationMilliseconds = monotonicNowMilliseconds() - nativeLoadStartedAtMonotonicMilliseconds;
        if (nativeHidLoadResult.state === "unavailable") {
            this.recordUnavailableStatus("driverUnavailable", snapshotTimestampMilliseconds, nativeHidLoadResult.error);
            logVendorHidPollDiagnostic({
                outcome: "nativeUnavailable",
                requestedMetricCount: requestedMetricKeys.length,
                candidateCount: 0,
                descriptorCount: 0,
                emittedMetricCount: 0,
                unavailableMetricCount: requestedMetricKeys.length,
                nativeLoadDurationMilliseconds,
                discoveryDurationMilliseconds: 0,
                totalDurationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
            });
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }

        if (!this.usesInjectedCandidateDiscovery) {
            const routeReadResult = await this.readRouteRegistryBatteryDevices(
                requestedMetricKeys,
                routeDefinitions,
                snapshotTimestampMilliseconds,
                nativeHidLoadResult.module,
                nativeLoadDurationMilliseconds,
                startedAtMonotonicMilliseconds,
            );
            this.scheduleDeferredFullDiscovery();
            return routeReadResult;
        }

        let discoveryResult: VendorHidBatteryDiscoveryResult;
        const discoveryStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        try {
            discoveryResult = await this.operationMutex.run("poll-discovery", () => discoverVendorHidBatteryDevices({
                nativeHidModule: nativeHidLoadResult.module,
                discoverCandidates: this.discoverCandidates,
                isExperimentalVendorHidEnabled: true,
                origin: "poll",
            }));
        } catch (error) {
            this.recordUnavailableStatus("sourceError", snapshotTimestampMilliseconds, error);
            logVendorHidPollDiagnostic({
                outcome: "discoveryError",
                requestedMetricCount: requestedMetricKeys.length,
                candidateCount: 0,
                descriptorCount: 0,
                emittedMetricCount: 0,
                unavailableMetricCount: requestedMetricKeys.length,
                nativeLoadDurationMilliseconds,
                discoveryDurationMilliseconds: monotonicNowMilliseconds() - discoveryStartedAtMonotonicMilliseconds,
                totalDurationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
            });
            return buildSourceSnapshotReadResult(
                snapshotTimestampMilliseconds,
                {},
                [],
                buildUnavailableReports(requestedMetricKeys, undefined),
            );
        }
        const discoveryDurationMilliseconds = monotonicNowMilliseconds() - discoveryStartedAtMonotonicMilliseconds;
        this.descriptorByMetricKey = new Map(discoveryResult.descriptors.map(descriptor => [descriptor.metricKey, descriptor]));

        const metrics: Record<string, MetricValue> = {};
        const valueMetadata: SourceMetricValueMetadata[] = [];
        const unavailableMetrics: MetricUnavailableReport[] = [];
        // Descriptors are the stable binding surface; candidates are this poll's live routes/readings.
        const candidatesById = new Map(discoveryResult.candidates.map(candidate => [candidate.candidateId, candidate]));
        const descriptorByMetricKey = new Map(discoveryResult.descriptors.map(descriptor => [descriptor.metricKey, descriptor]));

        for (const metricKey of requestedMetricKeys) {
            const descriptor = descriptorByMetricKey.get(metricKey);
            const candidate = !isReadableBatteryDescriptor(descriptor)
                ? undefined
                : selectDescriptorBatteryCandidate(descriptor, candidatesById);
            if (!isReadableBatteryDescriptor(descriptor) || candidate?.batteryPercent === undefined) {
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
        logVendorHidPollDiagnostic({
            outcome: "complete",
            requestedMetricCount: requestedMetricKeys.length,
            candidateCount: discoveryResult.candidates.length,
            descriptorCount: discoveryResult.descriptors.length,
            emittedMetricCount: Object.keys(metrics).length,
            unavailableMetricCount: unavailableMetrics.length,
            nativeLoadDurationMilliseconds,
            discoveryDurationMilliseconds,
            totalDurationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        });
        return buildSourceSnapshotReadResult(snapshotTimestampMilliseconds, metrics, valueMetadata, unavailableMetrics);
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    dispose(): void {
        if (this.deferredFullDiscoveryTimer !== undefined) {
            clearTimeout(this.deferredFullDiscoveryTimer);
            this.deferredFullDiscoveryTimer = undefined;
        }
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

    private resolveReaderEntries(nativeHidModule: NativeHidModule): readonly VendorHidBatteryReaderEntry[] {
        this.readerEntries ??= this.createReaders(nativeHidModule);
        return this.readerEntries;
    }

    private readRouteDefinitions(
        requestedMetricKeys: readonly string[],
    ): readonly VendorHidBatteryRouteDefinition[] {
        return requestedMetricKeys.flatMap(metricKey => {
            const definition = this.routeRegistry.read(metricKey);
            return definition === undefined ? [] : [definition];
        });
    }

    private async readSelectedBatteryDevices(
        requestedMetricKeys: readonly string[],
        snapshotTimestampMilliseconds: number,
        nativeLoadDurationMilliseconds: number,
        startedAtMonotonicMilliseconds: number,
    ): Promise<SourceSnapshotReadResult | undefined> {
        const readerEntries = this.readerEntries;
        if (readerEntries === undefined || this.descriptorByMetricKey.size === 0) {
            return undefined;
        }

        return this.operationMutex.run("selected-binding", async () => {
            const startedAtSelectedReadMilliseconds = monotonicNowMilliseconds();
            const candidates: BatteryDeviceDiscoveryCandidate[] = [];
            const unavailableMetrics: MetricUnavailableReport[] = [];
            for (const metricKey of requestedMetricKeys) {
                const descriptor = this.descriptorByMetricKey.get(metricKey);
                if (!isReadableBatteryDescriptor(descriptor)) {
                    unavailableMetrics.push(...buildUnavailableReports([metricKey], descriptor));
                    continue;
                }

                const candidate = await this.readSelectedBatteryDevice(metricKey, readerEntries);
                if (candidate === undefined) {
                    unavailableMetrics.push(...buildUnavailableReports([metricKey], descriptor));
                    continue;
                }

                candidates.push(candidate);
            }

            return this.buildSelectedReadResult({
                requestedMetricKeys,
                candidates,
                snapshotTimestampMilliseconds,
                nativeLoadDurationMilliseconds,
                selectedReadDurationMilliseconds: monotonicNowMilliseconds() - startedAtSelectedReadMilliseconds,
                startedAtMonotonicMilliseconds,
                outcome: "selectedComplete",
                initialUnavailableMetrics: unavailableMetrics,
            });
        });
    }

    private async readRouteRegistryBatteryDevices(
        requestedMetricKeys: readonly string[],
        routeDefinitions: readonly VendorHidBatteryRouteDefinition[],
        snapshotTimestampMilliseconds: number,
        nativeHidModule: NativeHidModule,
        nativeLoadDurationMilliseconds: number,
        startedAtMonotonicMilliseconds: number,
    ): Promise<SourceSnapshotReadResult> {
        return this.operationMutex.run("selected-route", async () => {
            const startedAtSelectedReadMilliseconds = monotonicNowMilliseconds();
            const nativeDiagnostics = createVendorHidBatteryDiscoveryNativeDiagnostics();
            const diagnosticNativeHidModule = createDiagnosticNativeHidModule(nativeHidModule, nativeDiagnostics);
            const deviceInfoList = diagnosticNativeHidModule.devices();
            const readerEntries = this.resolveReaderEntries(diagnosticNativeHidModule);
            const candidates: BatteryDeviceDiscoveryCandidate[] = [];

            for (const definition of routeDefinitions) {
                const candidate = await this.readBatteryDeviceFromIdentity(definition, readerEntries, deviceInfoList);
                if (candidate !== undefined) {
                    candidates.push(candidate);
                }
            }

            const descriptors = resolveBatteryDeviceDescriptors(candidates, {
                isExperimentalVendorHidEnabled: true,
            });
            for (const descriptor of descriptors) {
                this.descriptorByMetricKey.set(descriptor.metricKey, descriptor);
            }
            logVendorHidDiscoveryPassDiagnostic({
                phase: "complete",
                origin: "selectedRoute",
                nativeDiagnostics,
                durationMilliseconds: monotonicNowMilliseconds() - startedAtSelectedReadMilliseconds,
            });

            return this.buildSelectedReadResult({
                requestedMetricKeys,
                candidates,
                snapshotTimestampMilliseconds,
                nativeLoadDurationMilliseconds,
                selectedReadDurationMilliseconds: monotonicNowMilliseconds() - startedAtSelectedReadMilliseconds,
                startedAtMonotonicMilliseconds,
                outcome: "selectedRouteComplete",
            });
        });
    }

    private async readBatteryDeviceFromIdentity(
        definition: VendorHidBatteryRouteDefinition,
        readerEntries: readonly VendorHidBatteryReaderEntry[],
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        return this.readBatteryDeviceFromReaders(definition.metricKey, readerEntries, reader =>
            reader.readBatteryDeviceFromIdentity?.(
                definition.metricKey,
                definition.identity,
                deviceInfoList,
            ) ?? Promise.resolve(undefined));
    }

    private buildSelectedReadResult(options: {
        readonly requestedMetricKeys: readonly string[];
        readonly candidates: readonly BatteryDeviceDiscoveryCandidate[];
        readonly snapshotTimestampMilliseconds: number;
        readonly nativeLoadDurationMilliseconds: number;
        readonly selectedReadDurationMilliseconds: number;
        readonly startedAtMonotonicMilliseconds: number;
        readonly outcome: string;
        readonly initialUnavailableMetrics?: readonly MetricUnavailableReport[];
    }): SourceSnapshotReadResult {
        const unavailableMetrics: MetricUnavailableReport[] = [...(options.initialUnavailableMetrics ?? [])];
        const metrics: Record<string, MetricValue> = {};
        const valueMetadata: SourceMetricValueMetadata[] = [];
        for (const candidate of options.candidates) {
            const metricKey = buildBatteryMetricKeyFromIdentity(candidate.identity);
            const descriptor = this.descriptorByMetricKey.get(metricKey);
            if (!isReadableBatteryDescriptor(descriptor) || candidate.batteryPercent === undefined) {
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

        for (const metricKey of options.requestedMetricKeys) {
            if (metricKey in metrics || unavailableMetrics.some(report => report.metricId === metricKey)) {
                continue;
            }

            unavailableMetrics.push(...buildUnavailableReports([metricKey], this.descriptorByMetricKey.get(metricKey)));
        }

        this.status = {
            state: "available",
            lastSuccessAtTimestampMilliseconds: options.snapshotTimestampMilliseconds,
        };
        logVendorHidPollDiagnostic({
            outcome: options.outcome,
            requestedMetricCount: options.requestedMetricKeys.length,
            candidateCount: options.candidates.length,
            descriptorCount: this.descriptorByMetricKey.size,
            emittedMetricCount: Object.keys(metrics).length,
            unavailableMetricCount: unavailableMetrics.length,
            nativeLoadDurationMilliseconds: options.nativeLoadDurationMilliseconds,
            discoveryDurationMilliseconds: options.selectedReadDurationMilliseconds,
            totalDurationMilliseconds: monotonicNowMilliseconds() - options.startedAtMonotonicMilliseconds,
        });
        return buildSourceSnapshotReadResult(options.snapshotTimestampMilliseconds, metrics, valueMetadata, unavailableMetrics);
    }

    private async readSelectedBatteryDevice(
        metricKey: string,
        readerEntries: readonly VendorHidBatteryReaderEntry[],
    ): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        return this.readBatteryDeviceFromReaders(metricKey, readerEntries, reader =>
            reader.readBatteryDevice(metricKey));
    }

    private async readBatteryDeviceFromReaders(
        expectedMetricKey: string,
        readerEntries: readonly VendorHidBatteryReaderEntry[],
        readCandidate: (reader: VendorHidBatteryReader) => Promise<BatteryDeviceDiscoveryCandidate | undefined>,
    ): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        for (const { reader } of readerEntries) {
            const candidate = await readCandidate(reader);
            if (candidate === undefined) {
                continue;
            }

            // This is a reader-contract sanity check, not a live hardware identity proof. Vendor readers that can
            // read live unit identity must validate it before returning; readers that cannot must rely on exact HID
            // path/route targeting plus protocol parsers rejecting unrelated responses.
            if (buildBatteryMetricKeyFromIdentity(candidate.identity) === expectedMetricKey) {
                return candidate;
            }
        }

        return undefined;
    }

    private scheduleDeferredFullDiscovery(): void {
        if (
            this.usesInjectedCandidateDiscovery ||
            this.deferredFullDiscoveryTimer !== undefined ||
            this.deferredFullDiscoveryPromise !== undefined
        ) {
            return;
        }

        // Startup selected-route reads intentionally avoid a full receiver sweep.
        // Schedule one later full discovery to refresh the descriptor catalog after
        // the Stream Deck image-upload burst; the operation gate serializes it with
        // PI refreshes and steady-state selected polls if they overlap.
        this.deferredFullDiscoveryTimer = setTimeout(() => {
            this.deferredFullDiscoveryTimer = undefined;
            this.deferredFullDiscoveryPromise = this.runDeferredFullDiscovery()
                .finally(() => {
                    this.deferredFullDiscoveryPromise = undefined;
                });
        }, this.deferredFullDiscoveryDelayMilliseconds);
        unrefTimerIfAvailable(this.deferredFullDiscoveryTimer);
    }

    private async runDeferredFullDiscovery(): Promise<void> {
        if (!this.isExperimentalVendorHidEnabled()) {
            return;
        }

        const nativeHidLoadResult = await this.loadNativeHid();
        if (nativeHidLoadResult.state === "unavailable") {
            this.recordUnavailableStatus("driverUnavailable", this.wallClockNow(), nativeHidLoadResult.error);
            return;
        }

        try {
            const discoveryResult = await this.operationMutex.run("deferred-discovery", () => discoverVendorHidBatteryDevices({
                nativeHidModule: nativeHidLoadResult.module,
                discoverCandidates: this.discoverCandidates,
                isExperimentalVendorHidEnabled: true,
                origin: "deferred",
            }));
            this.descriptorByMetricKey = new Map(discoveryResult.descriptors.map(descriptor => [descriptor.metricKey, descriptor]));
        } catch (error) {
            this.recordUnavailableStatus("sourceError", this.wallClockNow(), error);
        }
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
    readonly discoverCandidates?: (
        nativeHidModule: NativeHidModule,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}): Promise<readonly BatteryDeviceDescriptor[]> {
    return (await readVendorHidBatteryDeviceDescriptorSnapshot(options)).descriptors;
}

/**
 * Reads available vendor HID battery descriptors and the filtered-device diagnostic snapshot for the picker.
 */
export async function readVendorHidBatteryDeviceDescriptorSnapshot(options: {
    readonly isExperimentalVendorHidEnabled: boolean;
    readonly loadNativeHid?: () => NativeHidLoadResult | Promise<NativeHidLoadResult>;
    readonly discoverCandidates?: (
        nativeHidModule: NativeHidModule,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}): Promise<VendorHidBatteryDeviceDescriptorSnapshot> {
    const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    if (!options.isExperimentalVendorHidEnabled) {
        logVendorHidDescriptorDiagnostic({
            outcome: "disabled",
            candidateCount: 0,
            descriptorCount: 0,
            durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        });
        return emptyVendorHidBatteryDeviceDescriptorSnapshot;
    }

    const nativeLoadStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    const nativeHidLoadResult = await (options.loadNativeHid ?? loadNativeHidModule)();
    const nativeLoadDurationMilliseconds = monotonicNowMilliseconds() - nativeLoadStartedAtMonotonicMilliseconds;
    if (nativeHidLoadResult.state === "unavailable") {
        log.atWarn()
            .everyMs("vendor-hid-battery:descriptor-load", VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "Vendor HID battery descriptor discovery unavailable",
                `error=${nativeHidLoadResult.error instanceof Error ? nativeHidLoadResult.error.message : String(nativeHidLoadResult.error)}`,
            ].join(" "));
        logVendorHidDescriptorDiagnostic({
            outcome: "nativeUnavailable",
            candidateCount: 0,
            descriptorCount: 0,
            durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
            nativeLoadDurationMilliseconds,
        });
        return emptyVendorHidBatteryDeviceDescriptorSnapshot;
    }

    const discoveryResult = await vendorHidOperationMutex.run("descriptor-discovery", () => discoverVendorHidBatteryDevices({
        nativeHidModule: nativeHidLoadResult.module,
        discoverCandidates: options.discoverCandidates ?? discoverVendorHidBatteryCandidates,
        isExperimentalVendorHidEnabled: options.isExperimentalVendorHidEnabled,
        origin: "descriptor",
    }));
    logVendorHidDescriptorDiagnostic({
        outcome: "complete",
        candidateCount: discoveryResult.candidates.length,
        descriptorCount: discoveryResult.descriptors.length,
        durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        nativeLoadDurationMilliseconds,
    });
    return {
        descriptors: discoveryResult.descriptors,
        diagnostics: discoveryResult.diagnostics,
    };
}

async function discoverVendorHidBatteryDevices(options: {
    readonly nativeHidModule: NativeHidModule;
    readonly discoverCandidates: (
        nativeHidModule: NativeHidModule,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ) => Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
    readonly isExperimentalVendorHidEnabled: boolean;
    readonly origin: VendorHidBatteryDiscoveryOrigin;
}): Promise<VendorHidBatteryDiscoveryResult> {
    const nativeDiagnostics = createVendorHidBatteryDiscoveryNativeDiagnostics();
    const diagnosticNativeHidModule = createDiagnosticNativeHidModule(options.nativeHidModule, nativeDiagnostics);
    const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
    let candidates: readonly BatteryDeviceDiscoveryCandidate[];
    try {
        await delayVendorHidStartupDiscovery();
        const deviceInfoList = diagnosticNativeHidModule.devices();
        candidates = await options.discoverCandidates(diagnosticNativeHidModule, deviceInfoList);
    } catch (error) {
        logVendorHidDiscoveryPassDiagnostic({
            phase: "error",
            origin: options.origin,
            nativeDiagnostics,
            durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
        });
        throw error;
    }
    const discoveryOptions = {
        isExperimentalVendorHidEnabled: options.isExperimentalVendorHidEnabled,
    };
    const descriptors = resolveBatteryDeviceDescriptors(candidates, discoveryOptions);
    const diagnostics = buildBatteryDeviceDiscoveryDiagnostics(candidates, descriptors, discoveryOptions);
    const durationMilliseconds = monotonicNowMilliseconds() - startedAtMonotonicMilliseconds;
    logVendorHidDiscoveryPassDiagnostic({
        phase: "complete",
        origin: options.origin,
        nativeDiagnostics,
        durationMilliseconds,
    });
    log.atInfo()
        .everyMs("vendor-hid-battery-discovery", VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "vendorHidBatteryDiscovery",
            `candidates=${candidates.length}`,
            `descriptors=${descriptors.length}`,
            `supportedDescriptors=${descriptors.filter(descriptor => descriptor.supportState === "supported").length}`,
            `experimentalDescriptors=${descriptors.filter(descriptor => descriptor.supportState === "experimental").length}`,
            `offlineDescriptors=${descriptors.filter(descriptor => descriptor.supportState === "offline").length}`,
            `ambiguousDescriptors=${descriptors.filter(descriptor => descriptor.supportState === "ambiguous").length}`,
            `durationMs=${durationMilliseconds}`,
        ].join(" "));

    return { descriptors, candidates, diagnostics };
}

function delayVendorHidStartupDiscovery(): Promise<void> {
    log.atInfo()
        .everyMs("vendor-hid-discovery-delay", VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "vendorHidDiscoveryDelay",
            `delayMs=${VENDOR_HID_DISCOVERY_STARTUP_DELAY_MILLISECONDS}`,
        ].join(" "));
    return new Promise(resolve => {
        setTimeout(resolve, VENDOR_HID_DISCOVERY_STARTUP_DELAY_MILLISECONDS);
    });
}

async function discoverVendorHidBatteryCandidates(
    nativeHidModule: NativeHidModule,
    deviceInfoList: readonly NativeHidDeviceInfo[],
): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
    return discoverVendorHidBatteryCandidatesFromReaders(createVendorHidBatteryReaders(nativeHidModule), deviceInfoList);
}

function createVendorHidBatteryReaders(nativeHidModule: NativeHidModule): readonly VendorHidBatteryReaderEntry[] {
    return [
        { name: "logitech", reader: new LogitechBatteryReader(nativeHidModule) },
        { name: "asusRog", reader: new AsusRogBatteryReader(nativeHidModule) },
    ];
}

/** Runs vendor HID battery readers without letting one vendor failure discard another vendor's candidates. */
export async function discoverVendorHidBatteryCandidatesFromReaders(
    readers: readonly VendorHidBatteryReaderEntry[],
    deviceInfoList: readonly NativeHidDeviceInfo[],
): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
    const candidateLists: BatteryDeviceDiscoveryCandidate[][] = [];

    for (const { name, reader } of readers) {
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        let candidates: readonly BatteryDeviceDiscoveryCandidate[];
        try {
            candidates = await reader.discoverBatteryDevices(deviceInfoList);
        } catch (error) {
            logVendorHidDiscovererError({
                name,
                durationMilliseconds: monotonicNowMilliseconds() - startedAtMonotonicMilliseconds,
                error,
            });
            candidateLists.push([]);
            continue;
        }
        log.atInfo()
            .everyMs(`vendor-hid-battery-discoverer:${name}`, VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "vendorHidBatteryDiscoverer",
                `name=${name}`,
                `candidates=${candidates.length}`,
                `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
            ].join(" "));
        candidateLists.push([...candidates]);
    }

    return candidateLists.flat();
}

function selectDescriptorBatteryCandidate(
    descriptor: BatteryDeviceDescriptor,
    candidatesById: ReadonlyMap<string, BatteryDeviceDiscoveryCandidate>,
): BatteryDeviceDiscoveryCandidate | undefined {
    const candidateId = descriptor.diagnostics?.candidateIds[0];
    const candidate = candidateId === undefined ? undefined : candidatesById.get(candidateId);
    return candidate?.batteryPercent === undefined ? undefined : candidate;
}

function isReadableBatteryDescriptor(
    descriptor: BatteryDeviceDescriptor | undefined,
): descriptor is BatteryDeviceDescriptor {
    return descriptor !== undefined && descriptor.supportState !== "ambiguous";
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
    const vendorHidIdentity = readSystemVendorHidPeripheralIdentity(descriptor.identity);

    return {
        sourceSensorId: descriptor.descriptorId,
        hardwareId: vendorHidIdentity?.vendorUnitId ?? vendorHidIdentity?.modelId ?? descriptor.descriptorId,
        hardwareType: "Peripheral",
        sensorName: "Battery",
        sourceSensorType: "Battery",
        hardwareName: descriptor.displayName,
    };
}

function isVendorHidBatteryMetricKey(metricKey: string): boolean {
    return isRuntimeVendorHidBatteryMetricKey(metricKey);
}

function createVendorHidBatteryDiscoveryNativeDiagnostics(): VendorHidBatteryDiscoveryNativeDiagnostics {
    vendorHidBatteryDiscoveryPassSequence += 1;
    return {
        passId: vendorHidBatteryDiscoveryPassSequence,
        deviceEnumerationCalls: 0,
        deviceEnumerationDurationMilliseconds: 0,
        lastEnumeratedDeviceCount: undefined,
        hidOpenCalls: 0,
        hidOpenDurationMilliseconds: 0,
    };
}

function createDiagnosticNativeHidModule(
    nativeHidModule: NativeHidModule,
    diagnostics: VendorHidBatteryDiscoveryNativeDiagnostics,
): NativeHidModule {
    class DiagnosticNativeHidDevice implements NativeHidDevice {
        readonly close: NativeHidDevice["close"];
        readonly getFeatureReport: NativeHidDevice["getFeatureReport"];
        readonly readTimeout: NativeHidDevice["readTimeout"];
        readonly sendFeatureReport: NativeHidDevice["sendFeatureReport"];
        readonly write: NativeHidDevice["write"];

        constructor(path: string, options?: { readonly nonExclusive?: boolean }) {
            const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
            diagnostics.hidOpenCalls += 1;
            let device: NativeHidDevice;
            try {
                device = new nativeHidModule.HID(path, options);
            } catch (error) {
                diagnostics.hidOpenDurationMilliseconds += monotonicNowMilliseconds() - startedAtMonotonicMilliseconds;
                logVendorHidNativeOperationError({
                    operation: "open",
                    nativeDiagnostics: diagnostics,
                    path,
                    error,
                });
                throw error;
            }
            diagnostics.hidOpenDurationMilliseconds += monotonicNowMilliseconds() - startedAtMonotonicMilliseconds;

            this.close = device.close.bind(device);
            this.getFeatureReport = device.getFeatureReport.bind(device);
            this.readTimeout = device.readTimeout.bind(device);
            this.sendFeatureReport = device.sendFeatureReport.bind(device);
            this.write = device.write.bind(device);
        }
    }

    return {
        HID: DiagnosticNativeHidDevice,
        devices: () => {
            const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
            diagnostics.deviceEnumerationCalls += 1;
            let devices: ReturnType<NativeHidModule["devices"]>;
            try {
                devices = nativeHidModule.devices();
            } catch (error) {
                diagnostics.deviceEnumerationDurationMilliseconds += monotonicNowMilliseconds() - startedAtMonotonicMilliseconds;
                logVendorHidNativeOperationError({
                    operation: "devices",
                    nativeDiagnostics: diagnostics,
                    error,
                });
                throw error;
            }
            diagnostics.deviceEnumerationDurationMilliseconds += monotonicNowMilliseconds() - startedAtMonotonicMilliseconds;
            diagnostics.lastEnumeratedDeviceCount = devices.length;
            return devices;
        },
    };
}

const emptyVendorHidBatteryDeviceDescriptorSnapshot = {
    descriptors: [],
    diagnostics: {
        detectedCandidateCount: 0,
        displayedDescriptorCount: 0,
        hiddenCandidates: [],
    },
} satisfies VendorHidBatteryDeviceDescriptorSnapshot;

function unrefTimerIfAvailable(timer: ReturnType<typeof setTimeout>): void {
    if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
        timer.unref();
    }
}

function logVendorHidPollDiagnostic(options: {
    readonly outcome: string;
    readonly requestedMetricCount: number;
    readonly candidateCount: number;
    readonly descriptorCount: number;
    readonly emittedMetricCount: number;
    readonly unavailableMetricCount: number;
    readonly nativeLoadDurationMilliseconds: number;
    readonly discoveryDurationMilliseconds: number;
    readonly totalDurationMilliseconds: number;
}): void {
    log.atInfo()
        .everyMs(`vendor-hid-battery-poll:${options.outcome}`, VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "vendorHidBatteryPoll",
            `outcome=${options.outcome}`,
            `requestedMetrics=${options.requestedMetricCount}`,
            `candidates=${options.candidateCount}`,
            `descriptors=${options.descriptorCount}`,
            `emittedMetrics=${options.emittedMetricCount}`,
            `unavailableMetrics=${options.unavailableMetricCount}`,
            `nativeLoadMs=${options.nativeLoadDurationMilliseconds}`,
            `discoveryMs=${options.discoveryDurationMilliseconds}`,
            `totalMs=${options.totalDurationMilliseconds}`,
        ].join(" "));
}

function logVendorHidDescriptorDiagnostic(options: {
    readonly outcome: string;
    readonly candidateCount: number;
    readonly descriptorCount: number;
    readonly durationMilliseconds: number;
    readonly nativeLoadDurationMilliseconds?: number;
}): void {
    log.atInfo()
        .everyMs(`vendor-hid-battery-descriptors:${options.outcome}`, VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "vendorHidBatteryDescriptorRefresh",
            `outcome=${options.outcome}`,
            `candidates=${options.candidateCount}`,
            `descriptors=${options.descriptorCount}`,
            `nativeLoadMs=${options.nativeLoadDurationMilliseconds ?? 0}`,
            `durationMs=${options.durationMilliseconds}`,
        ].join(" "));
}

function logVendorHidDiscoveryPassDiagnostic(options: {
    readonly phase: "complete" | "error";
    readonly origin: VendorHidBatteryDiscoveryOrigin;
    readonly nativeDiagnostics: VendorHidBatteryDiscoveryNativeDiagnostics;
    readonly durationMilliseconds: number;
}): void {
    log.atInfo()
        .everyMs(
            `vendor-hid-battery-discovery-pass:${options.phase}:${options.origin}`,
            VENDOR_HID_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "vendorHidBatteryDiscoveryPass",
            `phase=${options.phase}`,
            `origin=${options.origin}`,
            `passId=${options.nativeDiagnostics.passId}`,
            `devicesCalls=${options.nativeDiagnostics.deviceEnumerationCalls}`,
            `devicesMs=${options.nativeDiagnostics.deviceEnumerationDurationMilliseconds}`,
            `lastDeviceCount=${options.nativeDiagnostics.lastEnumeratedDeviceCount ?? "unknown"}`,
            `hidOpenCalls=${options.nativeDiagnostics.hidOpenCalls}`,
            `hidOpenMs=${options.nativeDiagnostics.hidOpenDurationMilliseconds}`,
            `durationMs=${options.durationMilliseconds}`,
        ].join(" "));
}

function logVendorHidDiscovererError(options: {
    readonly name: string;
    readonly durationMilliseconds: number;
    readonly error: unknown;
}): void {
    log.atWarn()
        .everyMs(
            `vendor-hid-battery-discoverer-error:${options.name}`,
            VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "vendorHidBatteryDiscovererError",
            `name=${options.name}`,
            `durationMs=${options.durationMilliseconds}`,
            ...formatErrorFields(options.error),
        ].join(" "));
}

function logVendorHidNativeOperationError(options: {
    readonly operation: "devices" | "open";
    readonly nativeDiagnostics: VendorHidBatteryDiscoveryNativeDiagnostics;
    readonly error: unknown;
    readonly path?: string;
}): void {
    log.atWarn()
        .everyMs(
            `vendor-hid-native-operation-error:${options.operation}`,
            VENDOR_HID_BATTERY_FAILURE_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "vendorHidNativeOperationError",
            `operation=${options.operation}`,
            `passId=${options.nativeDiagnostics.passId}`,
            `pathKey=${formatVendorHidPathKey(options.path)}`,
            `devicesCalls=${options.nativeDiagnostics.deviceEnumerationCalls}`,
            `hidOpenCalls=${options.nativeDiagnostics.hidOpenCalls}`,
            ...formatErrorFields(options.error),
        ].join(" "));
}

function formatErrorFields(error: unknown): readonly string[] {
    if (error instanceof Error) {
        return [
            `errorName=${sanitizeLogField(error.name)}`,
            `errorMessage=${sanitizeLogField(error.message)}`,
        ];
    }

    return [`errorMessage=${sanitizeLogField(String(error))}`];
}

function formatVendorHidPathKey(path: string | undefined): string {
    if (path === undefined) {
        return "none";
    }

    const normalizedPath = path.toLowerCase();
    const match = /#([^#]+)#/u.exec(normalizedPath);
    return sanitizeLogField(match?.[1] ?? normalizedPath).slice(0, 80) || "unknown";
}

function sanitizeLogField(value: string): string {
    return value
        .replace(/\s+/gu, "_")
        .replace(/[^a-zA-Z0-9._:&-]+/gu, "-")
        .slice(0, 160) || "empty";
}

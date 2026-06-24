import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";
import { logger } from "../../../logging/logger";
import { buildVendorHidBatteryPercentMetricKey } from "../../metric-keys";
import {
    buildBatteryDeviceDescriptorIdFromIdentity,
    buildBatteryMetricKeyFromIdentity,
} from "./battery-metric-key";
import type {
    BatteryDeviceTransport,
    BatteryDeviceDescriptor,
    BatteryDeviceBatteryPercentSource,
    BatteryDeviceSupportState,
    BatteryDeviceDiscoveryDiagnostics,
    BatteryDeviceHiddenCandidateDiagnostic,
    BatteryDeviceHiddenCandidateReason,
} from "./battery-device-descriptor";

const log = logger.for("Source:BatteryHID:Discovery");
const BATTERY_DEVICE_DISCOVERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 30_000;

export type BatteryDeviceDiscoveryCandidateSupportState =
    | "supported"
    | "experimental"
    | "unsupported"
    | "unknown"
    | "offline";

export type BatteryDeviceTelemetryFreshness =
    | "fresh"
    | "stale"
    | "unavailable";

/**
 * Describes one route that may expose battery data for one physical device.
 *
 * Protocol readers create candidates from OS, receiver, wired, or vendor HID observations.
 */
export interface BatteryDeviceDiscoveryCandidate {
    /** Runtime-only id for diagnostics and duplicate descriptor suffixes. */
    readonly candidateId: string;
    readonly displayName: string;
    readonly transport: SystemPeripheralBindingTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly identity: ResolvedSystemPeripheralIdentity;
    readonly supportState: BatteryDeviceDiscoveryCandidateSupportState;
    readonly isExperimental: boolean;
    readonly batteryPercent?: number;
    readonly batteryTelemetryFreshness?: BatteryDeviceTelemetryFreshness;
    readonly diagnostics?: BatteryDeviceDiscoveryCandidateDiagnostics;
}

/** Keeps route-local facts out of persisted identity while preserving debug value. */
export interface BatteryDeviceDiscoveryCandidateDiagnostics {
    readonly sourcePathId?: string;
    readonly receiverSlot?: number;
    readonly easySwitchSlot?: number;
    readonly batteryPercentSource?: BatteryDeviceBatteryPercentSource;
    readonly batteryVoltageMillivolts?: number;
}

/** Defines discovery-time gates that are owned by runtime state, not settings. */
export interface BatteryDeviceDiscoveryOptions {
    readonly isExperimentalVendorHidEnabled: boolean;
}

/** Produces protocol-specific battery candidates without deciding UI identity. */
export interface BatteryDeviceDiscoverer {
    discoverBatteryDevices(): Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
}

/** Runs protocol-specific discoverers and resolves their candidates into user-facing descriptors. */
export class BatteryDeviceDiscoveryService {
    constructor(
        private readonly discoverers: readonly BatteryDeviceDiscoverer[],
    ) {}

    async discoverBatteryDevices(options: BatteryDeviceDiscoveryOptions): Promise<readonly BatteryDeviceDescriptor[]> {
        const candidateLists = await Promise.all(
            this.discoverers.map(discoverer => discoverer.discoverBatteryDevices()),
        );

        return resolveBatteryDeviceDescriptors(candidateLists.flat(), options);
    }
}

/**
 * Resolves protocol-specific route candidates into stable battery descriptors.
 *
 * This function owns protocol-neutral identity matching and deliberately does
 * not read hardware, parse vendor reports, or persist discovered devices.
 */
export function resolveBatteryDeviceDescriptors(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    options: BatteryDeviceDiscoveryOptions,
): readonly BatteryDeviceDescriptor[] {
    const visibleCandidates = candidates.filter(candidate => isVisibleCandidate(candidate, options));
    const duplicateMetricKeys = buildDuplicateMetricKeySet(visibleCandidates);
    const descriptors = visibleCandidates
        .map(candidate => buildBatteryDeviceDescriptor(
            candidate,
            duplicateMetricKeys.has(buildBatteryMetricKeyFromIdentity(candidate.identity)),
        ))
        .sort(compareBatteryDeviceDescriptors);
    logBatteryDescriptorResolveSummary(candidates, visibleCandidates, duplicateMetricKeys.size, descriptors);
    return descriptors;
}

/** Builds the static diagnostics snapshot shown from the Property Inspector details page. */
export function buildBatteryDeviceDiscoveryDiagnostics(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    descriptors: readonly BatteryDeviceDescriptor[],
    options: BatteryDeviceDiscoveryOptions,
): BatteryDeviceDiscoveryDiagnostics {
    return {
        detectedCandidateCount: candidates.length,
        displayedDescriptorCount: descriptors.length,
        hiddenCandidates: candidates
            .filter(candidate => !isVisibleCandidate(candidate, options))
            .map(candidate => buildHiddenCandidateDiagnostic(candidate, options))
            .sort(compareHiddenCandidateDiagnostics),
    };
}

function isVisibleCandidate(
    candidate: BatteryDeviceDiscoveryCandidate,
    options: BatteryDeviceDiscoveryOptions,
): boolean {
    if (candidate.transport === "bluetooth") {
        return false;
    }

    if (candidate.supportState === "unsupported" || candidate.supportState === "unknown") {
        return false;
    }

    return options.isExperimentalVendorHidEnabled || !candidate.isExperimental;
}

function buildHiddenCandidateDiagnostic(
    candidate: BatteryDeviceDiscoveryCandidate,
    options: BatteryDeviceDiscoveryOptions,
): BatteryDeviceHiddenCandidateDiagnostic {
    return {
        candidateId: candidate.candidateId,
        displayName: candidate.displayName,
        transport: candidate.transport,
        receiverKind: candidate.receiverKind,
        supportState: mapCandidateSupportState(candidate.supportState),
        reason: resolveHiddenCandidateReason(candidate, options),
        vendorId: candidate.identity.vendorId,
        productId: candidate.identity.productId,
        modelId: candidate.identity.modelId,
        manufacturer: candidate.identity.manufacturer,
        productName: candidate.identity.productName,
        interfaceNumber: candidate.identity.interfaceNumber,
        usagePage: candidate.identity.usagePage,
        usageId: candidate.identity.usageId,
        receiverSlot: candidate.diagnostics?.receiverSlot,
        sourcePathId: candidate.diagnostics?.sourcePathId,
    };
}

function mapCandidateSupportState(
    supportState: BatteryDeviceDiscoveryCandidateSupportState,
): BatteryDeviceSupportState | "unknown" {
    switch (supportState) {
        case "supported":
        case "experimental":
        case "unsupported":
        case "offline":
            return supportState;
        case "unknown":
            return "unknown";
    }
}

function resolveHiddenCandidateReason(
    candidate: BatteryDeviceDiscoveryCandidate,
    options: BatteryDeviceDiscoveryOptions,
): BatteryDeviceHiddenCandidateReason {
    if (candidate.transport === "bluetooth") {
        return "bluetoothHandledBySystem";
    }

    if (!options.isExperimentalVendorHidEnabled && candidate.isExperimental) {
        return "experimentalDisabled";
    }

    switch (candidate.supportState) {
        case "unsupported":
            return "unsupported";
        case "unknown":
            return "unknownSupport";
        case "offline":
        case "supported":
        case "experimental":
            return "unknownSupport";
    }
}

function compareHiddenCandidateDiagnostics(
    left: BatteryDeviceHiddenCandidateDiagnostic,
    right: BatteryDeviceHiddenCandidateDiagnostic,
): number {
    return left.reason.localeCompare(right.reason)
        || left.displayName.localeCompare(right.displayName)
        || left.candidateId.localeCompare(right.candidateId);
}

/**
 * Finds persisted metric keys that are shared by multiple visible candidates.
 *
 * Duplicate keys become separate ambiguous descriptors instead of an automatic
 * merge. This prevents route-local or same-model evidence from silently choosing
 * which physical device a stored binding should mean.
 *
 * This intentionally makes a rare same-unit, multi-route device go dark until
 * the routes can be proven equivalent. A false merge would publish a plausible
 * but wrong battery value, while no-data is the safe failure mode.
 */
function buildDuplicateMetricKeySet(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
): ReadonlySet<string> {
    const metricKeyCounts = new Map<string, number>();
    for (const candidate of candidates) {
        const metricKey = buildBatteryMetricKeyFromIdentity(candidate.identity);
        metricKeyCounts.set(metricKey, (metricKeyCounts.get(metricKey) ?? 0) + 1);
    }

    return new Set([...metricKeyCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([metricKey]) => metricKey));
}

function buildBatteryDeviceDescriptor(
    candidate: BatteryDeviceDiscoveryCandidate,
    isDuplicateMetricKey: boolean,
): BatteryDeviceDescriptor {
    const bindingDescriptorId = buildBatteryDeviceDescriptorIdFromIdentity(candidate.identity);
    const descriptorId = isDuplicateMetricKey
        ? `${bindingDescriptorId}.candidate-${formatDuplicateCandidateDescriptorIdPart(candidate.candidateId)}`
        : bindingDescriptorId;

    return {
        descriptorId,
        displayName: candidate.displayName,
        metricKey: buildVendorHidBatteryPercentMetricKey(bindingDescriptorId),
        transport: candidate.transport,
        receiverKind: candidate.receiverKind,
        isExperimental: candidate.isExperimental,
        identity: candidate.identity,
        supportState: resolveDescriptorSupportState(candidate, isDuplicateMetricKey),
        diagnostics: buildBatteryDeviceDescriptorDiagnostics(candidate),
    };
}

function resolveDescriptorSupportState(
    candidate: BatteryDeviceDiscoveryCandidate,
    isDuplicateMetricKey: boolean,
): BatteryDeviceSupportState {
    if (isDuplicateMetricKey) {
        return "ambiguous";
    }

    switch (candidate.supportState) {
        case "supported":
            return "supported";
        case "experimental":
            return "experimental";
        case "offline":
            return "offline";
        case "unsupported":
        case "unknown":
            throw new Error("Unsupported or unknown battery candidates must be filtered before descriptor creation.");
    }
}

function buildBatteryDeviceDescriptorDiagnostics(
    candidate: BatteryDeviceDiscoveryCandidate,
): NonNullable<BatteryDeviceDescriptor["diagnostics"]> {
    return {
        candidateIds: [candidate.candidateId],
        sourcePathIds: candidate.diagnostics?.sourcePathId === undefined ? [] : [candidate.diagnostics.sourcePathId],
        receiverSlots: candidate.diagnostics?.receiverSlot === undefined ? [] : [candidate.diagnostics.receiverSlot],
        easySwitchSlots: candidate.diagnostics?.easySwitchSlot === undefined ? [] : [candidate.diagnostics.easySwitchSlot],
        batteryPercentSources: candidate.diagnostics?.batteryPercentSource === undefined
            ? []
            : [candidate.diagnostics.batteryPercentSource],
        batteryVoltageMillivolts: candidate.diagnostics?.batteryVoltageMillivolts === undefined
            ? []
            : [candidate.diagnostics.batteryVoltageMillivolts],
    };
}

function sanitizeDescriptorIdPart(value: string): string {
    return value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, "-")
        .replace(/-+/gu, "-")
        .replace(/^[-._]+|[-._]+$/gu, "")
        || "unknown";
}

function formatDuplicateCandidateDescriptorIdPart(candidateId: string): string {
    return `${sanitizeDescriptorIdPart(candidateId)}-${hashDescriptorIdPart(candidateId)}`;
}

function hashDescriptorIdPart(value: string): string {
    let hash = 0x811C9DC5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

function compareBatteryDeviceDescriptors(
    left: BatteryDeviceDescriptor,
    right: BatteryDeviceDescriptor,
): number {
    return compareTransportOrder(left.transport, right.transport)
        || left.displayName.localeCompare(right.displayName)
        || left.descriptorId.localeCompare(right.descriptorId);
}

function compareTransportOrder(
    left: BatteryDeviceTransport,
    right: BatteryDeviceTransport,
): number {
    return transportOrder(left) - transportOrder(right);
}

function transportOrder(transport: BatteryDeviceTransport): number {
    switch (transport) {
        case "system":
            return -1;
        case "bluetooth":
            return 0;
        case "usbReceiver":
            return 1;
        case "usbWired":
            return 2;
    }
}

function logBatteryDescriptorResolveSummary(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    visibleCandidates: readonly BatteryDeviceDiscoveryCandidate[],
    duplicateMetricKeyCount: number,
    descriptors: readonly BatteryDeviceDescriptor[],
): void {
    log.atInfo()
        .everyMs("battery-descriptor-resolve", BATTERY_DEVICE_DISCOVERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "batteryDescriptorResolve",
            `candidates=${candidates.length}`,
            `visibleCandidates=${visibleCandidates.length}`,
            `hiddenCandidates=${candidates.length - visibleCandidates.length}`,
            `candidateStates=${formatCandidateSupportCounts(candidates)}`,
            `duplicateMetricKeys=${duplicateMetricKeyCount}`,
            `descriptors=${descriptors.length}`,
            `descriptorStates=${formatDescriptorSupportCounts(descriptors)}`,
            `descriptorLabels=${formatDescriptorLabels(descriptors)}`,
        ].join(" "));
}

function formatCandidateSupportCounts(candidates: readonly BatteryDeviceDiscoveryCandidate[]): string {
    const counts = new Map<BatteryDeviceDiscoveryCandidateSupportState, number>();
    for (const candidate of candidates) {
        counts.set(candidate.supportState, (counts.get(candidate.supportState) ?? 0) + 1);
    }

    return formatCounts(counts);
}

function formatDescriptorSupportCounts(descriptors: readonly BatteryDeviceDescriptor[]): string {
    const counts = new Map<BatteryDeviceSupportState, number>();
    for (const descriptor of descriptors) {
        counts.set(descriptor.supportState, (counts.get(descriptor.supportState) ?? 0) + 1);
    }

    return formatCounts(counts);
}

function formatCounts<TKey extends string>(counts: ReadonlyMap<TKey, number>): string {
    return [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => `${key}:${count}`)
        .join(",") || "none";
}

function formatDescriptorLabels(descriptors: readonly BatteryDeviceDescriptor[]): string {
    return descriptors
        .slice(0, 8)
        .map(descriptor => [
            descriptor.supportState,
            descriptor.transport,
            descriptor.receiverKind ?? "noReceiver",
            descriptor.displayName,
        ].join("/"))
        .join("|") || "none";
}

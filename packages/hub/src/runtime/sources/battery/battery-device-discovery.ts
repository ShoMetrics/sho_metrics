import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";
import { logger } from "../../../logging/logger";
import {
    buildBatteryDeviceFallbackIdentityKey,
    buildBatteryDeviceDescriptorIdFromIdentity,
    buildBatteryMetricKeyFromDescriptorId,
    buildBatteryDeviceVendorUnitIdentityKey,
} from "./battery-metric-key";
import type {
    BatteryDeviceTransport,
    BatteryDeviceCoalescingDiagnostic,
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
 * Protocol readers create candidates from OS, receiver, wired, or vendor HID
 * observations. This layer may coalesce multiple candidates into one
 * descriptor, so candidate identity must contain stable device facts and not a
 * raw HID path.
 */
export interface BatteryDeviceDiscoveryCandidate {
    /** Runtime-only id for diagnostics and session conflict evidence. */
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

/** Records session evidence that a previously coalesced group should be split. */
export interface BatteryDeviceConflictEvidence {
    readonly candidateIds: readonly string[];
    readonly repeatedLargeDisagreement: boolean;
}

/**
 * Links mutually exclusive routes for known device families.
 *
 * Examples include a verified ROG wired PID and Omni receiver PID pair. These
 * rules are compatibility evidence, not a replacement for per-unit identity.
 */
export interface VerifiedBatteryDeviceRouteRule {
    readonly ruleId: string;
    matches(left: BatteryDeviceDiscoveryCandidate, right: BatteryDeviceDiscoveryCandidate): boolean;
}

/** Defines discovery-time gates that are owned by runtime state, not settings. */
export interface BatteryDeviceDiscoveryOptions {
    readonly isExperimentalVendorHidEnabled: boolean;
    readonly conflictEvidence?: readonly BatteryDeviceConflictEvidence[];
    readonly verifiedRouteRules?: readonly VerifiedBatteryDeviceRouteRule[];
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
    const conflictPairSet = buildConflictPairSet(options.conflictEvidence ?? []);
    const groups = groupPhysicalBatteryDevices(
        visibleCandidates,
        conflictPairSet,
        options.verifiedRouteRules ?? [],
    );
    const descriptors = groups
        .map(group => buildBatteryDeviceDescriptor(group))
        .sort(compareBatteryDeviceDescriptors);
    logBatteryDescriptorResolveSummary(candidates, visibleCandidates, groups, descriptors);
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

interface BatteryDeviceCandidateGroup {
    readonly candidates: readonly BatteryDeviceDiscoveryCandidate[];
    readonly coalescing: BatteryDeviceCoalescingDiagnostic;
}

/**
 * Groups candidates by physical-device evidence without averaging values.
 *
 * The order mirrors the product policy: strong unit identity or verified route
 * rules can merge routes, duplicate weak fallback buckets without a unit id
 * stay separate and ambiguous, and conflict evidence can split a previously
 * merged device for the current session.
 */
function groupPhysicalBatteryDevices(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    conflictPairSet: ReadonlySet<string>,
    verifiedRouteRules: readonly VerifiedBatteryDeviceRouteRule[],
): readonly BatteryDeviceCandidateGroup[] {
    const groups: BatteryDeviceCandidateGroup[] = [];
    const assignedCandidateIds = new Set<string>();
    const conflictCandidateIds = buildConflictCandidateIdSet(conflictPairSet);

    for (const candidate of candidates) {
        if (assignedCandidateIds.has(candidate.candidateId)) {
            continue;
        }

        const exactUnitGroup = candidates.filter(otherCandidate =>
            !assignedCandidateIds.has(otherCandidate.candidateId)
            && shouldCoalesceCandidates(candidate, otherCandidate, conflictPairSet, verifiedRouteRules),
        );
        if (exactUnitGroup.length > 1) {
            addGroup(groups, assignedCandidateIds, exactUnitGroup, resolveCoalescingReason(exactUnitGroup, verifiedRouteRules));
            continue;
        }

        const duplicateCandidateFallbackGroup = findDuplicateCandidateFallbackGroup(candidate, candidates, assignedCandidateIds);
        if (duplicateCandidateFallbackGroup.length > 1) {
            for (const duplicateCandidate of duplicateCandidateFallbackGroup) {
                addGroup(groups, assignedCandidateIds, [duplicateCandidate], "duplicateCandidateFallback");
            }
            continue;
        }

        addGroup(groups, assignedCandidateIds, [candidate], resolveSingleCandidateReason(candidate, conflictCandidateIds));
    }

    return groups;
}

function shouldCoalesceCandidates(
    left: BatteryDeviceDiscoveryCandidate,
    right: BatteryDeviceDiscoveryCandidate,
    conflictPairSet: ReadonlySet<string>,
    verifiedRouteRules: readonly VerifiedBatteryDeviceRouteRule[],
): boolean {
    if (left.candidateId === right.candidateId) {
        return true;
    }

    if (conflictPairSet.has(buildCandidatePairKey(left.candidateId, right.candidateId))) {
        return false;
    }

    return hasMatchingUnitIdentity(left, right)
        || verifiedRouteRules.some(rule => rule.matches(left, right));
}

/**
 * Finds candidates that share the same weak fallback bucket.
 *
 * These candidates become separate ambiguous descriptors instead of one false
 * merge. A later protocol reader can remove the ambiguity by providing a
 * trusted unit id.
 *
 * The fallback bucket can come from adapter-owned `identity.modelId` or exact
 * text identity. `modelId` is not interpreted here: it can mean an exact vendor
 * model, a tested family, or another adapter-defined compatibility bucket. For
 * example, G502 and G502 Limited compare as the same fallback only if the
 * Logitech adapter intentionally emits the same `modelId` for both. The core
 * layer never interprets product names or vendor marketing names as a model
 * taxonomy.
 */
function findDuplicateCandidateFallbackGroup(
    candidate: BatteryDeviceDiscoveryCandidate,
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    assignedCandidateIds: ReadonlySet<string>,
): readonly BatteryDeviceDiscoveryCandidate[] {
    const candidateFallbackKey = buildBatteryDeviceFallbackIdentityKey(candidate.identity);
    if (candidateFallbackKey === undefined || hasStrongUnitIdentity(candidate)) {
        return [candidate];
    }

    return candidates.filter(otherCandidate =>
        !assignedCandidateIds.has(otherCandidate.candidateId)
        && !hasStrongUnitIdentity(otherCandidate)
        && buildBatteryDeviceFallbackIdentityKey(otherCandidate.identity) === candidateFallbackKey,
    );
}

function addGroup(
    groups: BatteryDeviceCandidateGroup[],
    assignedCandidateIds: Set<string>,
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    coalescing: BatteryDeviceCoalescingDiagnostic,
): void {
    for (const candidate of candidates) {
        assignedCandidateIds.add(candidate.candidateId);
    }

    groups.push({ candidates, coalescing });
}

function resolveCoalescingReason(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    verifiedRouteRules: readonly VerifiedBatteryDeviceRouteRule[],
): BatteryDeviceCoalescingDiagnostic {
    const [firstCandidate, ...remainingCandidates] = candidates;
    if (firstCandidate !== undefined
        && remainingCandidates.every(candidate => hasMatchingUnitIdentity(firstCandidate, candidate))) {
        return "unitId";
    }

    if (firstCandidate !== undefined
        && remainingCandidates.some(candidate => verifiedRouteRules.some(rule => rule.matches(firstCandidate, candidate)))) {
        return "verifiedRouteRule";
    }

    return "uniqueCandidateFallback";
}

function resolveSingleCandidateReason(
    candidate: BatteryDeviceDiscoveryCandidate,
    conflictCandidateIds: ReadonlySet<string>,
): BatteryDeviceCoalescingDiagnostic {
    if (conflictCandidateIds.has(candidate.candidateId)) {
        return "conflictSplit";
    }

    return hasStrongUnitIdentity(candidate) ? "unitId" : "uniqueCandidateFallback";
}

function buildBatteryDeviceDescriptor(group: BatteryDeviceCandidateGroup): BatteryDeviceDescriptor {
    const selectedCandidate = selectDisplayCandidate(group.candidates);
    const bindingCandidate = selectBindingCandidate(group.candidates);
    const bindingDescriptorId = buildBatteryDeviceDescriptorIdFromIdentity(bindingCandidate.identity);
    const descriptorId = buildDescriptorId(group, bindingDescriptorId, bindingCandidate);

    return {
        descriptorId,
        displayName: selectedCandidate.displayName,
        metricKey: buildBatteryMetricKeyFromDescriptorId(bindingDescriptorId),
        transport: selectedCandidate.transport,
        receiverKind: selectedCandidate.receiverKind,
        isExperimental: selectedCandidate.isExperimental,
        identity: bindingCandidate.identity,
        supportState: resolveDescriptorSupportState(selectedCandidate, group.coalescing),
        diagnostics: buildBatteryDeviceDescriptorDiagnostics(group),
    };
}

/**
 * Builds the runtime descriptor id from binding identity, not display route.
 *
 * Ambiguous duplicate fallback descriptors include candidate identity only to
 * keep UI/runtime descriptor ids distinct. Their metric keys still use the
 * persisted binding identity because the session candidate suffix cannot be
 * reconstructed from stored settings.
 */
function buildDescriptorId(
    group: BatteryDeviceCandidateGroup,
    baseDescriptorId: string,
    bindingCandidate: BatteryDeviceDiscoveryCandidate,
): string {
    if (group.coalescing !== "duplicateCandidateFallback") {
        return baseDescriptorId;
    }

    return `${baseDescriptorId}.candidate-${sanitizeDescriptorIdPart(bindingCandidate.candidateId)}`;
}

/**
 * Chooses the route that should supply user-facing display fields.
 *
 * Fresh Bluetooth OS telemetry wins because it avoids vendor HID contention,
 * but this choice must not drive the stored binding identity.
 */
function selectDisplayCandidate(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
): BatteryDeviceDiscoveryCandidate {
    return [...candidates].sort(compareDisplayCandidates)[0];
}

function compareDisplayCandidates(
    left: BatteryDeviceDiscoveryCandidate,
    right: BatteryDeviceDiscoveryCandidate,
): number {
    return scoreDisplayCandidate(right) - scoreDisplayCandidate(left)
        || left.displayName.localeCompare(right.displayName)
        || left.candidateId.localeCompare(right.candidateId);
}

function scoreDisplayCandidate(candidate: BatteryDeviceDiscoveryCandidate): number {
    let score = 0;
    if (candidate.transport === "bluetooth" && candidate.batteryTelemetryFreshness === "fresh") {
        score += 100;
    }

    if (candidate.batteryTelemetryFreshness === "fresh") {
        score += 20;
    }

    if (!candidate.isExperimental) {
        score += 10;
    }

    if (candidate.supportState === "supported") {
        score += 5;
    }

    return score;
}

/**
 * Chooses the identity basis for descriptor ids and metric keys.
 *
 * This is intentionally independent from display freshness so the same
 * physical device keeps a stable runtime key when the preferred display route
 * changes from Bluetooth to receiver or wired.
 */
function selectBindingCandidate(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
): BatteryDeviceDiscoveryCandidate {
    return [...candidates].sort(compareBindingCandidates)[0];
}

function compareBindingCandidates(
    left: BatteryDeviceDiscoveryCandidate,
    right: BatteryDeviceDiscoveryCandidate,
): number {
    return scoreBindingCandidate(right) - scoreBindingCandidate(left)
        || compareTransportOrder(left.transport, right.transport)
        || left.displayName.localeCompare(right.displayName)
        || left.candidateId.localeCompare(right.candidateId);
}

/** Scores stable identity evidence, not display quality. */
function scoreBindingCandidate(candidate: BatteryDeviceDiscoveryCandidate): number {
    let score = 0;
    if (candidate.identity.vendorUnitId !== undefined) {
        score += 300;
    }

    // Adapter model/family ids are useful for stable descriptor ids, but they
    // are still weaker than per-unit evidence and cannot merge duplicates.
    if (candidate.identity.modelId !== undefined) {
        score += 100;
    }

    return score;
}

function resolveDescriptorSupportState(
    candidate: BatteryDeviceDiscoveryCandidate,
    coalescing: BatteryDeviceCoalescingDiagnostic,
): BatteryDeviceSupportState {
    if (coalescing === "duplicateCandidateFallback") {
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
    group: BatteryDeviceCandidateGroup,
): NonNullable<BatteryDeviceDescriptor["diagnostics"]> {
    return {
        candidateIds: uniqueSorted(group.candidates.map(candidate => candidate.candidateId)),
        sourcePathIds: uniqueSorted(group.candidates.flatMap(candidate =>
            candidate.diagnostics?.sourcePathId === undefined ? [] : [candidate.diagnostics.sourcePathId],
        )),
        receiverSlots: uniqueSortedNumbers(group.candidates.flatMap(candidate =>
            candidate.diagnostics?.receiverSlot === undefined ? [] : [candidate.diagnostics.receiverSlot],
        )),
        easySwitchSlots: uniqueSortedNumbers(group.candidates.flatMap(candidate =>
            candidate.diagnostics?.easySwitchSlot === undefined ? [] : [candidate.diagnostics.easySwitchSlot],
        )),
        batteryPercentSources: uniqueSorted(group.candidates.flatMap(candidate =>
            candidate.diagnostics?.batteryPercentSource === undefined ? [] : [candidate.diagnostics.batteryPercentSource],
        )),
        batteryVoltageMillivolts: uniqueSortedNumbers(group.candidates.flatMap(candidate =>
            candidate.diagnostics?.batteryVoltageMillivolts === undefined ? [] : [candidate.diagnostics.batteryVoltageMillivolts],
        )),
        coalescing: group.coalescing,
    };
}

function hasMatchingUnitIdentity(
    left: BatteryDeviceDiscoveryCandidate,
    right: BatteryDeviceDiscoveryCandidate,
): boolean {
    const leftVendorUnitKey = buildBatteryDeviceVendorUnitIdentityKey(left.identity);
    if (leftVendorUnitKey !== undefined && leftVendorUnitKey === buildBatteryDeviceVendorUnitIdentityKey(right.identity)) {
        return true;
    }

    return false;
}

/**
 * Returns whether a candidate has identity evidence strong enough to merge on.
 *
 * Trusted vendor protocol unit ids count. HID serials are intentionally not a
 * strong identity source until the persisted identity contract can also carry
 * the vendor-specific evidence that makes a serial trustworthy.
 */
function hasStrongUnitIdentity(candidate: BatteryDeviceDiscoveryCandidate): boolean {
    return buildBatteryDeviceVendorUnitIdentityKey(candidate.identity) !== undefined;
}

function buildConflictPairSet(
    conflictEvidenceList: readonly BatteryDeviceConflictEvidence[],
): ReadonlySet<string> {
    const pairSet = new Set<string>();

    for (const conflictEvidence of conflictEvidenceList) {
        if (!conflictEvidence.repeatedLargeDisagreement) {
            continue;
        }

        for (let leftIndex = 0; leftIndex < conflictEvidence.candidateIds.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < conflictEvidence.candidateIds.length; rightIndex += 1) {
                pairSet.add(buildCandidatePairKey(
                    conflictEvidence.candidateIds[leftIndex],
                    conflictEvidence.candidateIds[rightIndex],
                ));
            }
        }
    }

    return pairSet;
}

function buildConflictCandidateIdSet(conflictPairSet: ReadonlySet<string>): ReadonlySet<string> {
    const candidateIdSet = new Set<string>();

    for (const pairKey of conflictPairSet) {
        for (const candidateId of pairKey.split("\n")) {
            candidateIdSet.add(candidateId);
        }
    }

    return candidateIdSet;
}

function buildCandidatePairKey(leftCandidateId: string, rightCandidateId: string): string {
    return [leftCandidateId, rightCandidateId].sort().join("\n");
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

function uniqueSorted<TValue extends string>(values: readonly TValue[]): readonly TValue[] {
    return [...new Set(values)].sort();
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
    return [...new Set(values)].sort((left, right) => left - right);
}

function logBatteryDescriptorResolveSummary(
    candidates: readonly BatteryDeviceDiscoveryCandidate[],
    visibleCandidates: readonly BatteryDeviceDiscoveryCandidate[],
    groups: readonly BatteryDeviceCandidateGroup[],
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
            `groups=${groups.length}`,
            `coalescing=${formatCoalescingCounts(groups)}`,
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

function formatCoalescingCounts(groups: readonly BatteryDeviceCandidateGroup[]): string {
    const counts = new Map<BatteryDeviceCoalescingDiagnostic, number>();
    for (const group of groups) {
        counts.set(group.coalescing, (counts.get(group.coalescing) ?? 0) + 1);
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

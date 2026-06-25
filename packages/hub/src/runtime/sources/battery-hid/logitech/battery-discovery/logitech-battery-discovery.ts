import { logger } from "../../../../../logging/logger";
import { monotonicNowMilliseconds } from "../../../../../shared/clock";
import type {
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemVendorHidPeripheralIdentity,
} from "../../../../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../../../../settings/resolved-settings";
import { buildBatteryMetricKeyFromIdentity } from "../../../battery/battery-metric-key";
import type { NativeHidDeviceInfo, NativeHidModule } from "../../native-hid-loader-internal";
import type { BatteryDeviceDiscoveryCandidate } from "../../../battery/battery-device-discovery";
import type { VendorHidBatteryReader } from "../../vendor-hid-battery-reader";
import { LOGITECH_HIDPP_VENDOR_ID } from "../hidpp-protocol";
import {
    LogitechHidppSession,
    type LogitechKnownBatteryFeature,
    openNativeLogitechHidppTransport,
    type LogitechBatteryReadResult,
    type NativeLogitechHidppTransport,
} from "../logitech-hidpp-reader";
import { buildLogitechBatteryCandidate } from "./battery-candidate";
import {
    discoverOnlineBoltSlots,
    discoverOnlineUnifyingSlots,
    LOGITECH_OPENLOGI_RECEIVERS,
} from "./bolt-unifying";
import {
    discoverLightspeedSlotsToProbe,
    LOGITECH_LIGHTSPEED_RECEIVERS,
} from "./lightspeed";
import {
    formatHex,
    groupLogitechReceiverDevices,
    type LogitechReceiverDescriptor,
    type LogitechReceiverDeviceGroup,
    type LogitechReceiverSlotRoute,
} from "./receiver-routes";

const LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const LOGITECH_SELECTED_READ_DEBUG_LOG_INTERVAL_MILLISECONDS = 30_000;
const LOGITECH_RECEIVERS: readonly LogitechReceiverDescriptor[] = [
    ...LOGITECH_OPENLOGI_RECEIVERS,
    ...LOGITECH_LIGHTSPEED_RECEIVERS,
];
const log = logger.for("Source:BatteryHID:Logitech");

/**
 * Discovers Logitech HID++ battery-capable devices.
 *
 * Bolt uses pairing registers and Unifying uses arrival events to find online
 * slots. Known LIGHTSPEED receiver paths probe slot 1 only and require a
 * successful battery feature read before becoming candidates. V1 deliberately
 * does not scan direct Bluetooth/wired HID++ collections because Windows HID
 * enumeration does not reliably distinguish BT-classic from wired direct paths;
 * Bluetooth battery should come from OS telemetry instead.
 */
export class LogitechBatteryReader implements VendorHidBatteryReader {
    private readonly bindingByMetricKey = new Map<string, LogitechBatteryRouteBinding>();

    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const receiverDeviceGroups = groupLogitechReceiverDevices(deviceInfoList, LOGITECH_RECEIVERS);
        const candidates: BatteryDeviceDiscoveryCandidate[] = [];

        // Scan receiver groups serially on purpose. Most users have one Logitech
        // receiver, and serial HID++ traffic avoids multiplying USB/HID contention
        // when Bolt, Unifying, and LIGHTSPEED receivers are connected together.
        for (const receiverDeviceGroup of receiverDeviceGroups) {
            const receiverStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
            const transport = openNativeLogitechHidppTransport(
                receiverDeviceGroup.deviceInfoList,
                // Keep Logitech aligned with ASUS and the hardware probe scripts:
                // Windows Bolt/Unifying HID++ collections can fail to open while
                // the Stream Deck host and other software have handles alive. The
                // battery query is read-only, so non-exclusive opens are the least
                // invasive way to avoid dropping the whole Logitech reader before
                // any HID++ transaction is attempted.
                path => new this.nativeHidModule.HID(path, { nonExclusive: true }),
                openContextForReceiverDeviceGroup(receiverDeviceGroup),
            );
            if (transport === undefined) {
                logLogitechReceiverOpenFailure(receiverDeviceGroup);
                continue;
            }

            try {
                const session = new LogitechHidppSession(transport);
                const scanSummary = createLogitechReceiverScanSummary();
                const slotRoutes = discoverLogitechReceiverSlotRoutes(receiverDeviceGroup, transport);
                scanSummary.slotRouteCount = slotRoutes.length;
                for (const slotRoute of slotRoutes) {
                    const battery = session.readBattery(slotRoute.receiverSlot);
                    recordLogitechBatteryRead(scanSummary, battery);
                    if (battery.state !== "battery" || battery.feature === undefined) {
                        continue;
                    }

                    const candidate = buildLogitechBatteryCandidate({
                        receiverDeviceGroup,
                        slotRoute,
                        battery,
                    });
                    candidates.push(candidate);
                    this.storeBinding(
                        buildBatteryMetricKeyFromIdentity(candidate.identity),
                        receiverDeviceGroup,
                        slotRoute,
                        battery,
                        battery.feature,
                    );
                }

                logLogitechReceiverScanSummary(
                    receiverDeviceGroup,
                    scanSummary,
                    monotonicNowMilliseconds() - receiverStartedAtMonotonicMilliseconds,
                );
            } finally {
                transport.close();
            }
        }

        log.atInfo()
            .everyMs("logitech-hidpp-discovery", LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "logitechHidppDiscovery",
                `enumeratedDevices=${deviceInfoList.length}`,
                `receiverGroups=${receiverDeviceGroups.length}`,
                `candidates=${candidates.length}`,
                `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
            ].join(" "));
        return Promise.resolve(candidates);
    }

    readBatteryDevice(metricKey: string): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        const binding = this.bindingByMetricKey.get(metricKey);
        if (binding === undefined) {
            logLogitechSelectedReadOutcome("warmBinding", "missingBinding", {
                receiverKind: "unknown",
            });
            return Promise.resolve(undefined);
        }

        const transport = this.openReceiverDeviceGroup(binding.receiverDeviceGroup);
        if (transport === undefined) {
            logLogitechSelectedReadOutcome("warmBinding", "openFailed", {
                receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                productId: binding.receiverDeviceGroup.receiver.productId,
                receiverSlot: binding.slotRoute.receiverSlot,
            });
            return Promise.resolve(undefined);
        }

        try {
            const session = new LogitechHidppSession(transport);
            const battery = session.readBatteryFromKnownFeature(
                binding.slotRoute.receiverSlot,
                binding.batteryFeature,
            );
            if (battery.state !== "battery") {
                logLogitechSelectedReadOutcome("warmBinding", `battery:${battery.state}`, {
                    receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                    productId: binding.receiverDeviceGroup.receiver.productId,
                    receiverSlot: binding.slotRoute.receiverSlot,
                    detail: battery.state === "noData" ? battery.reason : undefined,
                });
                return Promise.resolve(undefined);
            }
            const liveDeviceInformation = binding.deviceInformation === undefined
                ? undefined
                : session.readDeviceInformation(binding.slotRoute.receiverSlot);
            if (binding.deviceInformation !== undefined && liveDeviceInformation?.state !== "deviceInformation") {
                logLogitechSelectedReadOutcome("warmBinding", "deviceInfoMissing", {
                    receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                    productId: binding.receiverDeviceGroup.receiver.productId,
                    receiverSlot: binding.slotRoute.receiverSlot,
                    detail: liveDeviceInformation?.state,
                });
                return Promise.resolve(undefined);
            }
            if (
                binding.deviceInformation !== undefined &&
                liveDeviceInformation?.state === "deviceInformation" &&
                !matchesBoundLogitechDeviceInformation(liveDeviceInformation.deviceInformation, binding.deviceInformation)
            ) {
                logLogitechSelectedReadOutcome("warmBinding", "deviceInfoMismatch", {
                    receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                    productId: binding.receiverDeviceGroup.receiver.productId,
                    receiverSlot: binding.slotRoute.receiverSlot,
                    hasLiveUnitId: liveDeviceInformation.deviceInformation.unitId !== undefined,
                    hasLiveModelId: liveDeviceInformation.deviceInformation.modelId !== undefined,
                });
                return Promise.resolve(undefined);
            }

            // Selected refreshes intentionally skip DeviceTypeAndName because it is display-only and may require
            // several HID++ chunks. DeviceInformation is different: Logitech exposes stable unit/model fields there,
            // so keep this one cheap live read as the identity proof before trusting a cached route.
            const candidate = buildLogitechBatteryCandidate({
                receiverDeviceGroup: binding.receiverDeviceGroup,
                slotRoute: binding.slotRoute,
                battery: {
                    ...battery,
                    deviceInformation: liveDeviceInformation?.state === "deviceInformation"
                        ? liveDeviceInformation.deviceInformation
                        : battery.deviceInformation,
                    deviceTypeAndName: binding.deviceTypeAndName ?? battery.deviceTypeAndName,
                },
            });
            if (
                liveDeviceInformation?.state === "deviceInformation" &&
                hasLogitechDeviceIdentity(liveDeviceInformation.deviceInformation)
            ) {
                if (buildBatteryMetricKeyFromIdentity(candidate.identity) !== metricKey) {
                    logLogitechSelectedReadOutcome("warmBinding", "metricKeyMismatch", {
                        receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                        productId: binding.receiverDeviceGroup.receiver.productId,
                        receiverSlot: binding.slotRoute.receiverSlot,
                        hasLiveUnitId: liveDeviceInformation.deviceInformation.unitId !== undefined,
                        hasLiveModelId: liveDeviceInformation.deviceInformation.modelId !== undefined,
                    });
                    return Promise.resolve(undefined);
                }

                logLogitechSelectedReadOutcome("warmBinding", "success", {
                    receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                    productId: binding.receiverDeviceGroup.receiver.productId,
                    receiverSlot: binding.slotRoute.receiverSlot,
                    hasLiveUnitId: liveDeviceInformation.deviceInformation.unitId !== undefined,
                    hasLiveModelId: liveDeviceInformation.deviceInformation.modelId !== undefined,
                });
                return Promise.resolve(candidate);
            }

            // Some Logitech paths can read battery without exposing live DeviceInformation. In that case the direct
            // read is guarded by the cached receiver path/slot plus HID++ battery parsing, not by a fresh unit-id
            // comparison. Returning the candidate keeps the selected read cheap while allowing the source client to
            // fall back to discovery if the route stops opening or stops returning a valid battery report.
            logLogitechSelectedReadOutcome("warmBinding", "successRouteOnly", {
                receiverKind: binding.receiverDeviceGroup.receiver.receiverKind,
                productId: binding.receiverDeviceGroup.receiver.productId,
                receiverSlot: binding.slotRoute.receiverSlot,
            });
            return Promise.resolve(candidate);
        } finally {
            transport.close();
        }
    }

    readBatteryDeviceFromIdentity(
        metricKey: string,
        identity: ResolvedSystemPeripheralIdentity,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        const vendorHidIdentity = readSystemVendorHidPeripheralIdentity(identity);
        if (
            vendorHidIdentity?.vendorId !== LOGITECH_HIDPP_VENDOR_ID ||
            !hasSelectedLogitechReceiverSlot(vendorHidIdentity) ||
            !isSupportedLogitechReceiverKind(vendorHidIdentity.receiverKind)
        ) {
            logLogitechSelectedReadOutcome("coldIdentity", "unsupportedIdentity", {
                receiverKind: vendorHidIdentity?.receiverKind ?? "unknown",
                hasVendorIdentity: vendorHidIdentity !== undefined,
                hasReceiverSlot: vendorHidIdentity === undefined ? false : hasSelectedLogitechReceiverSlot(vendorHidIdentity),
            });
            return Promise.resolve(undefined);
        }

        const receiverDeviceGroups = groupLogitechReceiverDevices(deviceInfoList, LOGITECH_RECEIVERS)
            .filter(receiverDeviceGroup =>
                receiverDeviceGroup.receiver.receiverKind === vendorHidIdentity.receiverKind &&
                (vendorHidIdentity.productId === undefined
                    || receiverDeviceGroup.receiver.productId === vendorHidIdentity.productId),
            );
        if (receiverDeviceGroups.length === 0) {
            logLogitechSelectedReadOutcome("coldIdentity", "receiverGroupMissing", {
                receiverKind: vendorHidIdentity.receiverKind,
                productId: vendorHidIdentity.productId,
                receiverSlot: vendorHidIdentity.receiverSlot,
            });
        }
        for (const receiverDeviceGroup of receiverDeviceGroups) {
            const candidate = this.readBatteryDeviceFromReceiverGroup(metricKey, vendorHidIdentity, receiverDeviceGroup);
            if (candidate !== undefined) {
                return Promise.resolve(candidate);
            }
        }

        return Promise.resolve(undefined);
    }

    private readBatteryDeviceFromReceiverGroup(
        metricKey: string,
        identity: ResolvedSystemVendorHidPeripheralIdentity & { readonly receiverSlot: number },
        receiverDeviceGroup: LogitechReceiverDeviceGroup,
    ): BatteryDeviceDiscoveryCandidate | undefined {
        const transport = this.openReceiverDeviceGroup(receiverDeviceGroup);
        if (transport === undefined) {
            logLogitechSelectedReadOutcome("coldIdentity", "openFailed", {
                receiverKind: receiverDeviceGroup.receiver.receiverKind,
                productId: receiverDeviceGroup.receiver.productId,
                receiverSlot: identity.receiverSlot,
            });
            return undefined;
        }

        try {
            const slotRoute = buildSelectedLogitechSlotRoute(identity);
            const session = new LogitechHidppSession(transport);
            const battery = session.readBatteryWithDeviceInformation(slotRoute.receiverSlot);
            if (battery.state !== "battery" || battery.feature === undefined) {
                logLogitechSelectedReadOutcome("coldIdentity", battery.state === "battery" ? "featureMissing" : `battery:${battery.state}`, {
                    receiverKind: receiverDeviceGroup.receiver.receiverKind,
                    productId: receiverDeviceGroup.receiver.productId,
                    receiverSlot: identity.receiverSlot,
                    detail: battery.state === "noData" ? battery.reason : undefined,
                });
                return undefined;
            }

            if (!matchesSelectedLogitechDeviceInformation(identity, battery.deviceInformation)) {
                logLogitechSelectedReadOutcome("coldIdentity", "deviceInfoMismatch", {
                    receiverKind: receiverDeviceGroup.receiver.receiverKind,
                    productId: receiverDeviceGroup.receiver.productId,
                    receiverSlot: identity.receiverSlot,
                    hasLiveUnitId: battery.deviceInformation?.unitId !== undefined,
                    hasLiveModelId: battery.deviceInformation?.modelId !== undefined,
                });
                return undefined;
            }

            const candidate = buildLogitechBatteryCandidate({
                receiverDeviceGroup,
                slotRoute,
                battery,
            });
            if (buildBatteryMetricKeyFromIdentity(candidate.identity) !== metricKey) {
                logLogitechSelectedReadOutcome("coldIdentity", "metricKeyMismatch", {
                    receiverKind: receiverDeviceGroup.receiver.receiverKind,
                    productId: receiverDeviceGroup.receiver.productId,
                    receiverSlot: identity.receiverSlot,
                    hasLiveUnitId: battery.deviceInformation?.unitId !== undefined,
                    hasLiveModelId: battery.deviceInformation?.modelId !== undefined,
                });
                return undefined;
            }

            this.storeBinding(metricKey, receiverDeviceGroup, slotRoute, battery, battery.feature);
            logLogitechSelectedReadOutcome(
                "coldIdentity",
                battery.deviceInformation === undefined || !hasLogitechDeviceIdentity(battery.deviceInformation)
                    ? "successRouteOnly"
                    : "success",
                {
                    receiverKind: receiverDeviceGroup.receiver.receiverKind,
                    productId: receiverDeviceGroup.receiver.productId,
                    receiverSlot: identity.receiverSlot,
                    hasLiveUnitId: battery.deviceInformation?.unitId !== undefined,
                    hasLiveModelId: battery.deviceInformation?.modelId !== undefined,
                },
            );
            return candidate;
        } finally {
            transport.close();
        }
    }

    private openReceiverDeviceGroup(
        receiverDeviceGroup: LogitechReceiverDeviceGroup,
    ): NativeLogitechHidppTransport | undefined {
        try {
            return openNativeLogitechHidppTransport(
                receiverDeviceGroup.deviceInfoList,
                // See the discovery open path above: selected-device refreshes
                // should use the same non-exclusive handle mode as full scans.
                path => new this.nativeHidModule.HID(path, { nonExclusive: true }),
                openContextForReceiverDeviceGroup(receiverDeviceGroup),
            );
        } catch {
            return undefined;
        }
    }

    private storeBinding(
        metricKey: string,
        receiverDeviceGroup: LogitechReceiverDeviceGroup,
        slotRoute: LogitechReceiverSlotRoute,
        battery: LogitechBatteryResult,
        batteryFeature: LogitechKnownBatteryFeature,
    ): void {
        this.bindingByMetricKey.set(metricKey, {
            receiverDeviceGroup,
            slotRoute,
            batteryFeature,
            deviceInformation: battery.deviceInformation,
            deviceTypeAndName: battery.deviceTypeAndName,
        });
    }
}

interface LogitechBatteryRouteBinding {
    readonly receiverDeviceGroup: LogitechReceiverDeviceGroup;
    readonly slotRoute: LogitechReceiverSlotRoute;
    readonly batteryFeature: LogitechKnownBatteryFeature;
    readonly deviceInformation?: LogitechBatteryResult["deviceInformation"];
    readonly deviceTypeAndName?: LogitechBatteryResult["deviceTypeAndName"];
}

type LogitechBatteryNoDataReason = Extract<LogitechBatteryReadResult, { readonly state: "noData" }>["reason"];
type LogitechBatteryResult = Extract<LogitechBatteryReadResult, { readonly state: "battery" }>;

function isSupportedLogitechReceiverKind(
    receiverKind: ResolvedSystemVendorHidPeripheralIdentity["receiverKind"],
): receiverKind is LogitechReceiverDescriptor["receiverKind"] {
    return receiverKind === "bolt" || receiverKind === "unifying" || receiverKind === "lightspeed";
}

function hasSelectedLogitechReceiverSlot(
    identity: ResolvedSystemVendorHidPeripheralIdentity,
): identity is ResolvedSystemVendorHidPeripheralIdentity & { readonly receiverSlot: number } {
    return identity.receiverSlot !== undefined;
}

function buildSelectedLogitechSlotRoute(
    identity: ResolvedSystemVendorHidPeripheralIdentity & { readonly receiverSlot: number },
): LogitechReceiverSlotRoute {
    return {
        receiverSlot: identity.receiverSlot,
        vendorUnitId: identity.vendorUnitId,
        modelId: identity.modelId,
        deviceKind: undefined,
        wirelessProductId: undefined,
    };
}

function matchesSelectedLogitechDeviceInformation(
    identity: ResolvedSystemVendorHidPeripheralIdentity,
    liveDeviceInformation: LogitechBatteryResult["deviceInformation"],
): boolean {
    if (identity.vendorUnitId === undefined && identity.modelId === undefined) {
        // Some Logitech routes cannot expose a live unit/model identity. In that case
        // selected reads deliberately fall back to route-only trust
        // (receiver kind + product id + receiver slot); reusing the same slot for a
        // different paired device can therefore report the new device's battery.
        return true;
    }

    if (liveDeviceInformation === undefined) {
        // DeviceInformation carries the strongest Logitech unit/model proof, but
        // some selected reads can return battery while the identity request times
        // out. Treat absence as route-only trust rather than no-data. The narrow
        // risk is a same-model device re-paired into the same receiver slot while
        // DeviceInformation is unavailable; successful live mismatches still fail.
        return true;
    }

    return (identity.vendorUnitId === undefined || liveDeviceInformation.unitId === identity.vendorUnitId)
        && (identity.modelId === undefined || liveDeviceInformation.modelId === identity.modelId);
}

function hasLogitechDeviceIdentity(deviceInformation: NonNullable<LogitechBatteryResult["deviceInformation"]>): boolean {
    return deviceInformation.unitId !== undefined
        || deviceInformation.modelId !== undefined;
}

function matchesBoundLogitechDeviceInformation(
    liveDeviceInformation: NonNullable<LogitechBatteryResult["deviceInformation"]>,
    boundDeviceInformation: NonNullable<LogitechBatteryResult["deviceInformation"]>,
): boolean {
    return (boundDeviceInformation.unitId === undefined || liveDeviceInformation.unitId === boundDeviceInformation.unitId)
        && (boundDeviceInformation.modelId === undefined || liveDeviceInformation.modelId === boundDeviceInformation.modelId);
}

interface LogitechReceiverScanSummary {
    batteryCandidateCount: number;
    slotRouteCount: number;
    unsupportedSlotCount: number;
    unrelatedReportCount: number;
    noDataCounts: Record<LogitechBatteryNoDataReason, number>;
}

function createLogitechReceiverScanSummary(): LogitechReceiverScanSummary {
    return {
        batteryCandidateCount: 0,
        slotRouteCount: 0,
        unsupportedSlotCount: 0,
        unrelatedReportCount: 0,
        noDataCounts: {
            timeout: 0,
            deviceError: 0,
            malformed: 0,
            noPercentage: 0,
            outOfRange: 0,
            ioError: 0,
        },
    };
}

function recordLogitechBatteryRead(
    summary: LogitechReceiverScanSummary,
    batteryReadResult: LogitechBatteryReadResult,
): void {
    switch (batteryReadResult.state) {
        case "battery":
            summary.batteryCandidateCount += 1;
            summary.unrelatedReportCount += batteryReadResult.unrelatedReportCount;
            return;
        case "unsupported":
            summary.unsupportedSlotCount += 1;
            return;
        case "noData":
            summary.noDataCounts[batteryReadResult.reason] += 1;
            summary.unrelatedReportCount += batteryReadResult.unrelatedReportCount;
            return;
    }
}

function logLogitechReceiverScanSummary(
    receiverDeviceGroup: LogitechReceiverDeviceGroup,
    summary: LogitechReceiverScanSummary,
    durationMilliseconds: number,
): void {
    log.atInfo()
        .everyMs(
            `hidpp-receiver-scan:${receiverDeviceGroup.groupId}`,
            LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "logitechHidppReceiverScan",
            `receiverKind=${receiverDeviceGroup.receiver.receiverKind}`,
            `productId=${formatHex(receiverDeviceGroup.receiver.productId)}`,
            `groupId=${receiverDeviceGroup.groupId}`,
            `hidCollections=${receiverDeviceGroup.deviceInfoList.length}`,
            `slotRoutes=${summary.slotRouteCount}`,
            `candidates=${summary.batteryCandidateCount}`,
            `unsupportedSlots=${summary.unsupportedSlotCount}`,
            `noData=${formatNoDataCounts(summary.noDataCounts)}`,
            `unrelatedReports=${summary.unrelatedReportCount}`,
            `durationMs=${durationMilliseconds}`,
        ].join(" "));
}

function logLogitechReceiverOpenFailure(receiverDeviceGroup: LogitechReceiverDeviceGroup): void {
    log.atInfo()
        .everyMs(`hidpp-receiver-open:${receiverDeviceGroup.groupId}`, LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "logitechHidppReceiverOpenFailed",
            `receiverKind=${receiverDeviceGroup.receiver.receiverKind}`,
            `productId=${formatHex(receiverDeviceGroup.receiver.productId)}`,
            `groupId=${receiverDeviceGroup.groupId}`,
            `hidCollections=${receiverDeviceGroup.deviceInfoList.length}`,
        ].join(" "));
}

function logLogitechSelectedReadOutcome(
    mode: "warmBinding" | "coldIdentity",
    outcome: string,
    options: {
        readonly receiverKind: string;
        readonly productId?: number;
        readonly receiverSlot?: number;
        readonly hasVendorIdentity?: boolean;
        readonly hasReceiverSlot?: boolean;
        readonly hasLiveUnitId?: boolean;
        readonly hasLiveModelId?: boolean;
        readonly detail?: string;
    },
): void {
    if (outcome === "success") {
        return;
    }

    log.atInfo()
        .everyMs(
            `logitech-selected-read:${mode}:${outcome}`,
            LOGITECH_SELECTED_READ_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "logitechHidppSelectedRead",
            `mode=${mode}`,
            `outcome=${outcome}`,
            `receiverKind=${options.receiverKind}`,
            `productId=${options.productId === undefined ? "unknown" : formatHex(options.productId)}`,
            `receiverSlot=${options.receiverSlot ?? "unknown"}`,
            `hasVendorIdentity=${options.hasVendorIdentity ?? "unknown"}`,
            `hasReceiverSlot=${options.hasReceiverSlot ?? "unknown"}`,
            `hasLiveUnitId=${options.hasLiveUnitId ?? "unknown"}`,
            `hasLiveModelId=${options.hasLiveModelId ?? "unknown"}`,
            `detail=${options.detail ?? "none"}`,
        ].join(" "));
}

function openContextForReceiverDeviceGroup(receiverDeviceGroup: LogitechReceiverDeviceGroup): {
    readonly receiverKind: string;
    readonly groupId: string;
} {
    return {
        receiverKind: receiverDeviceGroup.receiver.receiverKind,
        groupId: receiverDeviceGroup.groupId,
    };
}

function formatNoDataCounts(counts: Record<LogitechBatteryNoDataReason, number>): string {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `${reason}:${count}`)
        .join(",") || "none";
}

function discoverLogitechReceiverSlotRoutes(
    receiverDeviceGroup: LogitechReceiverDeviceGroup,
    transport: NativeLogitechHidppTransport,
): readonly LogitechReceiverSlotRoute[] {
    switch (receiverDeviceGroup.receiver.receiverKind) {
        case "bolt":
            return discoverOnlineBoltSlots(transport);
        case "unifying":
            return discoverOnlineUnifyingSlots(transport);
        case "lightspeed":
            return discoverLightspeedSlotsToProbe();
        default:
            return assertNever(receiverDeviceGroup.receiver.receiverKind);
    }
}

function assertNever(value: never): never {
    throw new Error(`Unexpected Logitech receiver kind: ${value}`);
}

import { logger } from "../../../../../logging/logger";
import { monotonicNowMilliseconds } from "../../../../../shared/clock";
import { buildBatteryMetricKeyFromIdentity } from "../../../battery/battery-metric-key";
import type { NativeHidDeviceInfo, NativeHidModule } from "../../native-hid-loader-internal";
import type { BatteryDeviceDiscoveryCandidate } from "../../../battery/battery-device-discovery";
import type { VendorHidBatteryReader } from "../../../battery/vendor-hid-battery-reader";
import {
    LogitechHidppSession,
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

        for (const receiverDeviceGroup of receiverDeviceGroups) {
            const receiverStartedAtMonotonicMilliseconds = monotonicNowMilliseconds();
            const transport = openNativeLogitechHidppTransport(
                receiverDeviceGroup.deviceInfoList,
                path => new this.nativeHidModule.HID(path),
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
                    if (battery.state !== "battery") {
                        continue;
                    }

                    const candidate = buildLogitechBatteryCandidate({
                        receiverDeviceGroup,
                        slotRoute,
                        battery,
                    });
                    candidates.push(candidate);
                    this.bindingByMetricKey.set(buildBatteryMetricKeyFromIdentity(candidate.identity), {
                        receiverDeviceGroup,
                        slotRoute,
                    });
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
            return Promise.resolve(undefined);
        }

        let transport: NativeLogitechHidppTransport | undefined;
        try {
            transport = openNativeLogitechHidppTransport(
                binding.receiverDeviceGroup.deviceInfoList,
                path => new this.nativeHidModule.HID(path),
            );
        } catch {
            return Promise.resolve(undefined);
        }

        if (transport === undefined) {
            return Promise.resolve(undefined);
        }

        try {
            const session = new LogitechHidppSession(transport);
            const battery = session.readBattery(binding.slotRoute.receiverSlot);
            if (battery.state !== "battery") {
                return Promise.resolve(undefined);
            }

            const candidate = buildLogitechBatteryCandidate({
                receiverDeviceGroup: binding.receiverDeviceGroup,
                slotRoute: binding.slotRoute,
                battery,
            });
            if (hasLiveLogitechDeviceIdentity(battery)) {
                return Promise.resolve(buildBatteryMetricKeyFromIdentity(candidate.identity) === metricKey
                    ? candidate
                    : undefined);
            }

            // Some Logitech paths can read battery without exposing live DeviceInformation. In that case the direct
            // read is guarded by the cached receiver path/slot plus HID++ battery parsing, not by a fresh unit-id
            // comparison. Returning the candidate keeps the selected read cheap while allowing the source client to
            // fall back to discovery if the route stops opening or stops returning a valid battery report.
            return Promise.resolve(candidate);
        } finally {
            transport.close();
        }
    }
}

interface LogitechBatteryRouteBinding {
    readonly receiverDeviceGroup: LogitechReceiverDeviceGroup;
    readonly slotRoute: LogitechReceiverSlotRoute;
}

type LogitechBatteryNoDataReason = Extract<LogitechBatteryReadResult, { readonly state: "noData" }>["reason"];
type LogitechBatteryResult = Extract<LogitechBatteryReadResult, { readonly state: "battery" }>;

function hasLiveLogitechDeviceIdentity(battery: LogitechBatteryResult): boolean {
    return battery.deviceInformation?.unitId !== undefined
        || battery.deviceInformation?.modelId !== undefined;
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

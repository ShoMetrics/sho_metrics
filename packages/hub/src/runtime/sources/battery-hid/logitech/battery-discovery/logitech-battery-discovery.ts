import { logger } from "../../../../../logging/logger";
import type { NativeHidModule } from "../../native-hid-loader-internal";
import type {
    BatteryDeviceDiscoverer,
    BatteryDeviceDiscoveryCandidate,
} from "../../../battery/battery-device-discovery";
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
export class LogitechBatteryDeviceDiscoverer implements BatteryDeviceDiscoverer {
    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
        const deviceInfoList = this.nativeHidModule.devices();
        const receiverDeviceGroups = groupLogitechReceiverDevices(deviceInfoList, LOGITECH_RECEIVERS);
        const candidates: BatteryDeviceDiscoveryCandidate[] = [];

        for (const receiverDeviceGroup of receiverDeviceGroups) {
            const transport = openNativeLogitechHidppTransport(
                receiverDeviceGroup.deviceInfoList,
                path => new this.nativeHidModule.HID(path),
            );
            if (transport === undefined) {
                continue;
            }

            try {
                const session = new LogitechHidppSession(transport);
                const scanSummary = createLogitechReceiverScanSummary();
                for (const slotRoute of discoverLogitechReceiverSlotRoutes(receiverDeviceGroup, transport)) {
                    const battery = session.readBattery(slotRoute.receiverSlot);
                    recordLogitechBatteryRead(scanSummary, battery);
                    if (battery.state !== "battery") {
                        continue;
                    }

                    candidates.push(buildLogitechBatteryCandidate({
                        receiverDeviceGroup,
                        slotRoute,
                        battery,
                    }));
                }

                logLogitechReceiverScanSummary(receiverDeviceGroup.receiver, scanSummary);
            } finally {
                transport.close();
            }
        }

        return Promise.resolve(candidates);
    }
}

type LogitechBatteryNoDataReason = Extract<LogitechBatteryReadResult, { readonly state: "noData" }>["reason"];

interface LogitechReceiverScanSummary {
    batteryCandidateCount: number;
    unsupportedSlotCount: number;
    unrelatedReportCount: number;
    noDataCounts: Record<LogitechBatteryNoDataReason, number>;
}

function createLogitechReceiverScanSummary(): LogitechReceiverScanSummary {
    return {
        batteryCandidateCount: 0,
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
    receiver: LogitechReceiverDescriptor,
    summary: LogitechReceiverScanSummary,
): void {
    log.atDebug()
        .everyMs(
            `hidpp-receiver-scan:${receiver.receiverKind}:${formatHex(receiver.productId)}`,
            LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            `Logitech HID++ receiver scan receiverKind=${receiver.receiverKind}`,
            `candidates=${summary.batteryCandidateCount}`,
            `unsupportedSlots=${summary.unsupportedSlotCount}`,
            `noData=${formatNoDataCounts(summary.noDataCounts)}`,
            `unrelatedReports=${summary.unrelatedReportCount}`,
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

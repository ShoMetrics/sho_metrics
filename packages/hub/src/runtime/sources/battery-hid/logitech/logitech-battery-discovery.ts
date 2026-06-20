import type {
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../../settings/resolved-settings";
import { logger } from "../../../../logging/logger";
import type { NativeHidModule, NativeHidDeviceInfo } from "../native-hid-loader-internal";
import type {
    BatteryDeviceDiscoverer,
    BatteryDeviceDiscoveryCandidate,
} from "../../battery/battery-device-discovery";
import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
} from "./hidpp-protocol";
import {
    LogitechHidppSession,
    openNativeLogitechHidppTransport,
    type LogitechBatteryReadResult,
    type NativeLogitechHidppTransport,
} from "./logitech-hidpp-reader";
import {
    buildLogitechDevicePairingInformationRequest,
    parseLogitechReceiverPairingInformation,
    parseLogitechReceiverRegisterResponse,
} from "./logitech-receiver-registers";

const LOGITECH_MANUFACTURER = "Logitech";
const LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const log = logger.for("Source:BatteryHID:Logitech");

/**
 * Logitech HID++ collection facts cross-checked against OpenLogi.
 *
 * Source: OpenLogi
 * Files: `crates/openlogi-hid/src/transport.rs`,
 * `crates/openlogi-hid/src/route.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 *
 * Only protocol facts are used here: receiver PIDs, Unifying arrival events,
 * and Bolt pairing-register unit ids. Discovery remains ShoMetrics code and
 * only emits a candidate after a read-only battery feature succeeds.
 */

interface LogitechReceiverDescriptor {
    readonly receiverKind: Extract<SystemPeripheralReceiverKind, "bolt" | "unifying">;
    readonly productId: number;
    readonly displayPrefix: string;
}

const LOGITECH_RECEIVERS: readonly LogitechReceiverDescriptor[] = [
    {
        receiverKind: "bolt",
        productId: LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Bolt device",
    },
    {
        receiverKind: "unifying",
        productId: LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Unifying device",
    },
    {
        receiverKind: "unifying",
        productId: LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Unifying device",
    },
];

/**
 * Discovers Logitech HID++ battery-capable devices.
 *
 * Receiver-backed devices are addressed by receiver slot 1..6. V1 deliberately
 * does not scan direct Bluetooth/wired HID++ collections because Windows HID
 * enumeration does not reliably distinguish BT-classic from wired direct
 * paths; Bluetooth battery should come from OS telemetry instead.
 */
export class LogitechBatteryDeviceDiscoverer implements BatteryDeviceDiscoverer {
    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
        const deviceInfoList = this.nativeHidModule.devices();
        const receiverDeviceGroups = groupLogitechReceiverManagementDevices(deviceInfoList);
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
                for (const onlineSlot of discoverOnlineLogitechReceiverSlots(receiverDeviceGroup, transport)) {
                    const battery = session.readBattery(onlineSlot.receiverSlot);
                    recordLogitechBatteryRead(scanSummary, battery);
                    if (battery.state !== "battery") {
                        continue;
                    }

                    candidates.push(buildLogitechBatteryCandidate({
                        receiverDeviceGroup,
                        onlineSlot,
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

interface LogitechReceiverDeviceGroup {
    readonly receiver: LogitechReceiverDescriptor;
    readonly groupId: string;
    readonly deviceInfoList: readonly NativeHidDeviceInfo[];
}

interface LogitechOnlineReceiverSlot {
    readonly receiverSlot: number;
    readonly vendorUnitId?: string;
    readonly wirelessProductId?: number;
    readonly deviceKind?: string;
}

function groupLogitechReceiverManagementDevices(
    deviceInfoList: readonly NativeHidDeviceInfo[],
): readonly LogitechReceiverDeviceGroup[] {
    const deviceGroupsById = new Map<string, LogitechReceiverDeviceGroup>();

    for (const deviceInfo of deviceInfoList) {
        const receiver = LOGITECH_RECEIVERS.find(candidateReceiver =>
            deviceInfo.vendorId === LOGITECH_HIDPP_VENDOR_ID &&
            deviceInfo.productId === candidateReceiver.productId &&
            deviceInfo.usagePage === LOGITECH_HIDPP_CLASSIC_USAGE_PAGE &&
            deviceInfo.path !== undefined,
        );
        if (receiver === undefined) {
            continue;
        }

        const groupId = buildReceiverGroupId(deviceInfo, receiver);
        const existingGroup = deviceGroupsById.get(groupId);
        if (existingGroup === undefined) {
            deviceGroupsById.set(groupId, {
                receiver,
                groupId,
                deviceInfoList: [deviceInfo],
            });
            continue;
        }

        deviceGroupsById.set(groupId, {
            ...existingGroup,
            deviceInfoList: [...existingGroup.deviceInfoList, deviceInfo],
        });
    }

    return [...deviceGroupsById.values()].sort((left, right) =>
        left.groupId.localeCompare(right.groupId),
    );
}

function discoverOnlineLogitechReceiverSlots(
    receiverDeviceGroup: LogitechReceiverDeviceGroup,
    transport: NativeLogitechHidppTransport,
): readonly LogitechOnlineReceiverSlot[] {
    return receiverDeviceGroup.receiver.receiverKind === "bolt"
        ? discoverOnlineBoltSlots(transport)
        : discoverOnlineUnifyingSlots(transport);
}

function discoverOnlineBoltSlots(transport: NativeLogitechHidppTransport): readonly LogitechOnlineReceiverSlot[] {
    const slots: LogitechOnlineReceiverSlot[] = [];
    for (let receiverSlot = 1; receiverSlot <= 6; receiverSlot += 1) {
        const request = buildLogitechDevicePairingInformationRequest(receiverSlot);
        const result = transport.exchange(request);
        if (result.state !== "response") {
            continue;
        }

        const registerResponse = parseLogitechReceiverRegisterResponse(result.report, request);
        if (registerResponse.state !== "register") {
            continue;
        }

        const parsed = parseLogitechReceiverPairingInformation("bolt", registerResponse.payload);
        if (parsed.state !== "pairingInformation" || !parsed.pairingInformation.online) {
            continue;
        }

        slots.push({
            receiverSlot,
            vendorUnitId: parsed.pairingInformation.unitId,
            wirelessProductId: parsed.pairingInformation.wirelessProductId,
            deviceKind: parsed.pairingInformation.deviceKind,
        });
    }

    return slots;
}

function discoverOnlineUnifyingSlots(transport: NativeLogitechHidppTransport): readonly LogitechOnlineReceiverSlot[] {
    const events = transport.drainReceiverConnectionEvents("unifying");
    if (events === undefined) {
        return [];
    }

    return events
        .filter(event => event.online)
        .map(event => ({
            receiverSlot: event.receiverSlot,
            wirelessProductId: event.wirelessProductId,
            deviceKind: event.deviceKind,
        }));
}

function buildLogitechBatteryCandidate(input: {
    readonly receiverDeviceGroup: LogitechReceiverDeviceGroup;
    readonly onlineSlot: LogitechOnlineReceiverSlot;
    readonly battery: Extract<ReturnType<LogitechHidppSession["readBattery"]>, { readonly state: "battery" }>;
}): BatteryDeviceDiscoveryCandidate {
    const representativeDeviceInfo = input.receiverDeviceGroup.deviceInfoList[0];
    const deviceInformation = input.battery.deviceInformation;
    const displayName = buildDisplayName(input.receiverDeviceGroup.receiver, input.onlineSlot.receiverSlot);
    const bindingTransport: SystemPeripheralBindingTransport = "usbReceiver";
    const vendorUnitId = deviceInformation?.unitId ?? input.onlineSlot.vendorUnitId;

    return {
        candidateId: `logitech-${input.receiverDeviceGroup.groupId}-slot-${input.onlineSlot.receiverSlot}`,
        displayName,
        transport: bindingTransport,
        receiverKind: input.receiverDeviceGroup.receiver.receiverKind,
        identity: {
            vendorId: LOGITECH_HIDPP_VENDOR_ID,
            // Receiver-backed paths expose the receiver PID/interface here.
            // Stable descriptor keys use HID++ unit/model ids instead.
            productId: representativeDeviceInfo.productId,
            manufacturer: representativeDeviceInfo.manufacturer ?? LOGITECH_MANUFACTURER,
            productName: displayName,
            serialNumber: undefined,
            interfaceNumber: representativeDeviceInfo.interface,
            usagePage: representativeDeviceInfo.usagePage,
            usageId: representativeDeviceInfo.usage,
            bindingTransport,
            receiverKind: input.receiverDeviceGroup.receiver.receiverKind,
            vendorUnitId,
            modelId: deviceInformation?.modelId,
            receiverSlot: input.onlineSlot.receiverSlot,
        },
        supportState: "supported",
        isExperimental: true,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: input.receiverDeviceGroup.deviceInfoList
                .flatMap(deviceInfo => deviceInfo.path === undefined ? [] : [deviceInfo.path])
                .join(";"),
            receiverSlot: input.onlineSlot.receiverSlot,
        },
    };
}

function buildReceiverGroupId(
    deviceInfo: NativeHidDeviceInfo,
    receiver: LogitechReceiverDescriptor,
): string {
    return [
        receiver.receiverKind,
        formatHex(deviceInfo.productId),
        deviceInfo.serialNumber ?? "no-serial",
        deviceInfo.manufacturer ?? "unknown-manufacturer",
        deviceInfo.product ?? "unknown-product",
    ]
        .join(".")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, "-")
        .replace(/-+/gu, "-")
        .replace(/^[-._]+|[-._]+$/gu, "");
}

function buildDisplayName(
    receiver: LogitechReceiverDescriptor,
    receiverSlot: number,
): string {
    return `${receiver.displayPrefix} slot ${receiverSlot}`;
}

function formatHex(value: number | undefined): string {
    return value === undefined ? "unknown" : value.toString(16).padStart(4, "0");
}

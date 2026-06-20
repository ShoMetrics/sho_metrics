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
    LOGITECH_HIDPP_BLE_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    LOGITECH_HIDPP_GAMING_USAGE_PAGE,
    LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
} from "./hidpp-protocol";
import {
    LogitechHidppSession,
    buildLogitechReceiverSlotList,
    openNativeLogitechHidppTransport,
    type LogitechBatteryReadResult,
} from "./logitech-hidpp-reader";

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
 * Only protocol facts are used here: receiver PIDs, HID++ long-collection
 * usage pairs, and direct-device slot `0xff`. Discovery remains ShoMetrics
 * code and only emits a candidate after a read-only battery feature succeeds.
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
 * Receiver-backed devices are addressed by receiver slot 1..6. Direct USB,
 * Bluetooth, or wired HID++ collections are addressed through HID++ self slot
 * `0xff`; those paths cover devices such as G-series/LIGHTSPEED-style routes
 * when they expose the standard HID++ battery features.
 */
export class LogitechBatteryDeviceDiscoverer implements BatteryDeviceDiscoverer {
    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
        const deviceInfoList = this.nativeHidModule.devices();
        const receiverDeviceGroups = groupLogitechReceiverManagementDevices(deviceInfoList);
        const directDeviceGroups = groupLogitechDirectHidppDevices(deviceInfoList);
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
                for (const receiverSlot of buildLogitechReceiverSlotList()) {
                    const battery = session.readBattery(receiverSlot);
                    recordLogitechBatteryRead(scanSummary, battery);
                    if (battery.state !== "battery") {
                        continue;
                    }

                    candidates.push(buildLogitechBatteryCandidate({
                        receiverDeviceGroup,
                        receiverSlot,
                        battery,
                    }));
                }

                logLogitechReceiverScanSummary(receiverDeviceGroup.receiver, scanSummary);
            } finally {
                transport.close();
            }
        }

        for (const directDeviceGroup of directDeviceGroups) {
            const transport = openNativeLogitechHidppTransport(
                directDeviceGroup.deviceInfoList,
                path => new this.nativeHidModule.HID(path),
            );
            if (transport === undefined) {
                continue;
            }

            try {
                const session = new LogitechHidppSession(transport);
                const battery = session.readBattery(LOGITECH_HIDPP_DIRECT_DEVICE_SLOT);
                logLogitechDirectScanSummary(directDeviceGroup, battery);
                if (battery.state !== "battery") {
                    continue;
                }

                candidates.push(buildLogitechDirectBatteryCandidate({
                    directDeviceGroup,
                    battery,
                }));
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

function logLogitechDirectScanSummary(
    directDeviceGroup: LogitechDirectDeviceGroup,
    batteryReadResult: LogitechBatteryReadResult,
): void {
    log.atDebug()
        .everyMs(
            [
                "hidpp-direct-scan",
                formatHex(directDeviceGroup.primaryDeviceInfo.productId),
                formatHex(directDeviceGroup.primaryDeviceInfo.usagePage),
                formatHex(directDeviceGroup.primaryDeviceInfo.usage),
            ].join(":"),
            LOGITECH_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() => [
            "Logitech HID++ direct scan",
            `productId=${formatHex(directDeviceGroup.primaryDeviceInfo.productId)}`,
            `usagePage=${formatHex(directDeviceGroup.primaryDeviceInfo.usagePage)}`,
            `usage=${formatHex(directDeviceGroup.primaryDeviceInfo.usage)}`,
            `outcome=${batteryReadResult.state}`,
            batteryReadResult.state === "noData" ? `reason=${batteryReadResult.reason}` : undefined,
            batteryReadResult.state === "battery"
                ? `unrelatedReports=${batteryReadResult.unrelatedReportCount}`
                : undefined,
        ].filter(part => part !== undefined).join(" "));
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

interface LogitechDirectDeviceGroup {
    readonly groupId: string;
    readonly primaryDeviceInfo: NativeHidDeviceInfo;
    readonly deviceInfoList: readonly NativeHidDeviceInfo[];
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

function groupLogitechDirectHidppDevices(
    deviceInfoList: readonly NativeHidDeviceInfo[],
): readonly LogitechDirectDeviceGroup[] {
    const deviceGroupsById = new Map<string, {
        readonly deviceInfoList: readonly NativeHidDeviceInfo[];
        readonly primaryDeviceInfo?: NativeHidDeviceInfo;
    }>();

    for (const deviceInfo of deviceInfoList) {
        if (!isPotentialLogitechDirectHidppCollection(deviceInfo)) {
            continue;
        }

        const groupId = buildDirectGroupId(deviceInfo);
        const existingGroup = deviceGroupsById.get(groupId);
        deviceGroupsById.set(groupId, {
            deviceInfoList: sortLogitechHidppDeviceInfoList([
                ...(existingGroup?.deviceInfoList ?? []),
                deviceInfo,
            ]),
            primaryDeviceInfo: existingGroup?.primaryDeviceInfo ??
                (isLogitechDirectHidppLongCollection(deviceInfo) ? deviceInfo : undefined),
        });
    }

    return [...deviceGroupsById.entries()]
        .flatMap(([groupId, group]) => group.primaryDeviceInfo === undefined
            ? []
            : [{
                groupId,
                primaryDeviceInfo: group.primaryDeviceInfo,
                deviceInfoList: group.deviceInfoList,
            }])
        .sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function isPotentialLogitechDirectHidppCollection(deviceInfo: NativeHidDeviceInfo): boolean {
    return deviceInfo.vendorId === LOGITECH_HIDPP_VENDOR_ID &&
        deviceInfo.productId !== undefined &&
        !isKnownLogitechReceiverProductId(deviceInfo.productId) &&
        deviceInfo.path !== undefined &&
        (isLogitechDirectHidppLongCollection(deviceInfo) || isLogitechClassicShortCollection(deviceInfo));
}

function isKnownLogitechReceiverProductId(productId: number): boolean {
    return LOGITECH_RECEIVERS.some(receiver => receiver.productId === productId);
}

function isLogitechDirectHidppLongCollection(deviceInfo: NativeHidDeviceInfo): boolean {
    return (deviceInfo.usagePage === LOGITECH_HIDPP_CLASSIC_USAGE_PAGE &&
        deviceInfo.usage === LOGITECH_HIDPP_CLASSIC_LONG_USAGE) ||
        (deviceInfo.usagePage === LOGITECH_HIDPP_GAMING_USAGE_PAGE &&
            (deviceInfo.usage === LOGITECH_HIDPP_BLE_LONG_USAGE ||
                deviceInfo.usage === LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE));
}

function isLogitechClassicShortCollection(deviceInfo: NativeHidDeviceInfo): boolean {
    return deviceInfo.usagePage === LOGITECH_HIDPP_CLASSIC_USAGE_PAGE &&
        deviceInfo.usage === LOGITECH_HIDPP_SHORT_USAGE;
}

function sortLogitechHidppDeviceInfoList(
    deviceInfoList: readonly NativeHidDeviceInfo[],
): readonly NativeHidDeviceInfo[] {
    return [...deviceInfoList].sort((left, right) =>
        scoreLogitechWriteCollection(right) - scoreLogitechWriteCollection(left)
        || (left.path ?? "").localeCompare(right.path ?? ""),
    );
}

function scoreLogitechWriteCollection(deviceInfo: NativeHidDeviceInfo): number {
    if (isLogitechClassicShortCollection(deviceInfo)) {
        return 2;
    }

    if (isLogitechDirectHidppLongCollection(deviceInfo)) {
        return 1;
    }

    return 0;
}

function buildLogitechBatteryCandidate(input: {
    readonly receiverDeviceGroup: LogitechReceiverDeviceGroup;
    readonly receiverSlot: number;
    readonly battery: Extract<ReturnType<LogitechHidppSession["readBattery"]>, { readonly state: "battery" }>;
}): BatteryDeviceDiscoveryCandidate {
    const representativeDeviceInfo = input.receiverDeviceGroup.deviceInfoList[0];
    const deviceInformation = input.battery.deviceInformation;
    const displayName = buildDisplayName(input.receiverDeviceGroup.receiver, input.receiverSlot);
    const bindingTransport: SystemPeripheralBindingTransport = "usbReceiver";

    return {
        candidateId: `logitech-${input.receiverDeviceGroup.groupId}-slot-${input.receiverSlot}`,
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
            vendorUnitId: deviceInformation?.unitId,
            modelId: deviceInformation?.modelId,
            receiverSlot: input.receiverSlot,
        },
        supportState: "supported",
        isExperimental: true,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: input.receiverDeviceGroup.deviceInfoList
                .flatMap(deviceInfo => deviceInfo.path === undefined ? [] : [deviceInfo.path])
                .join(";"),
            receiverSlot: input.receiverSlot,
            easySwitchSlot: input.battery.easySwitchSlot,
        },
    };
}

function buildLogitechDirectBatteryCandidate(input: {
    readonly directDeviceGroup: LogitechDirectDeviceGroup;
    readonly battery: Extract<ReturnType<LogitechHidppSession["readBattery"]>, { readonly state: "battery" }>;
}): BatteryDeviceDiscoveryCandidate {
    const representativeDeviceInfo = input.directDeviceGroup.primaryDeviceInfo;
    const deviceInformation = input.battery.deviceInformation;
    const displayName = representativeDeviceInfo.product ?? "Logitech HID++ device";
    const bindingTransport = resolveLogitechDirectBindingTransport(representativeDeviceInfo);

    return {
        candidateId: `logitech-direct-${input.directDeviceGroup.groupId}`,
        displayName,
        transport: bindingTransport,
        receiverKind: undefined,
        identity: {
            vendorId: LOGITECH_HIDPP_VENDOR_ID,
            productId: representativeDeviceInfo.productId,
            manufacturer: representativeDeviceInfo.manufacturer ?? LOGITECH_MANUFACTURER,
            productName: displayName,
            // Raw HID serial strings are not treated as per-unit identity. The
            // HID++ DeviceInformation unit id is the trusted Logitech signal.
            serialNumber: undefined,
            interfaceNumber: representativeDeviceInfo.interface,
            usagePage: representativeDeviceInfo.usagePage,
            usageId: representativeDeviceInfo.usage,
            bindingTransport,
            receiverKind: undefined,
            vendorUnitId: deviceInformation?.unitId,
            modelId: deviceInformation?.modelId,
            receiverSlot: undefined,
        },
        supportState: "experimental",
        isExperimental: true,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: input.directDeviceGroup.deviceInfoList
                .flatMap(deviceInfo => deviceInfo.path === undefined ? [] : [deviceInfo.path])
                .join(";"),
            easySwitchSlot: input.battery.easySwitchSlot,
        },
    };
}

function resolveLogitechDirectBindingTransport(
    deviceInfo: NativeHidDeviceInfo,
): SystemPeripheralBindingTransport {
    if (deviceInfo.usagePage === LOGITECH_HIDPP_GAMING_USAGE_PAGE &&
        deviceInfo.usage === LOGITECH_HIDPP_BLE_LONG_USAGE) {
        return "bluetooth";
    }

    return productTextLooksLikeReceiver(deviceInfo.product) ? "usbReceiver" : "usbWired";
}

function productTextLooksLikeReceiver(productName: string | undefined): boolean {
    return productName?.toLowerCase().includes("receiver") ?? false;
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

function buildDirectGroupId(deviceInfo: NativeHidDeviceInfo): string {
    return [
        "direct",
        formatHex(deviceInfo.productId),
        buildHidppPhysicalPathKey(deviceInfo.path),
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

function buildHidppPhysicalPathKey(path: string | undefined): string {
    if (path === undefined) {
        return "unknown-path";
    }

    // Windows exposes HID++ short/long collections as separate paths such as
    // `MI_02&Col01` and `MI_02&Col02`. Normalize the collection suffix so both
    // handles stay in one transaction group.
    return path
        .toLowerCase()
        .replace(/&col[0-9a-f]+/gu, "");
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

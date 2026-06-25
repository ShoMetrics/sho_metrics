import type {
    SystemPeripheralBindingTransport,
} from "../../../../../settings/resolved-settings";
import type {
    BatteryDeviceDiscoveryCandidate,
} from "../../../battery/battery-device-discovery";
import { LOGITECH_HIDPP_VENDOR_ID } from "../hidpp-protocol";
import type { LogitechBatteryReadResult } from "../logitech-hidpp-reader";
import type {
    LogitechReceiverDeviceGroup,
    LogitechReceiverDescriptor,
    LogitechReceiverSlotRoute,
} from "./receiver-routes";

const LOGITECH_MANUFACTURER = "Logitech";

/** Builds the ShoMetrics discovery candidate for a verified Logitech battery route. */
export function buildLogitechBatteryCandidate(input: {
    readonly receiverDeviceGroup: LogitechReceiverDeviceGroup;
    readonly slotRoute: LogitechReceiverSlotRoute;
    readonly battery: Extract<LogitechBatteryReadResult, { readonly state: "battery" }>;
}): BatteryDeviceDiscoveryCandidate {
    const representativeDeviceInfo = input.receiverDeviceGroup.deviceInfoList[0];
    const deviceInformation = input.battery.deviceInformation;
    const displayName = buildDisplayName({
        receiver: input.receiverDeviceGroup.receiver,
        receiverSlot: input.slotRoute.receiverSlot,
        marketingName: input.battery.deviceTypeAndName?.marketingName,
        deviceKind: input.battery.deviceTypeAndName?.deviceType ?? input.slotRoute.deviceKind,
    });
    const bindingTransport: SystemPeripheralBindingTransport = "usbReceiver";
    const vendorUnitId = deviceInformation?.unitId ?? input.slotRoute.vendorUnitId;

    return {
        candidateId: `logitech-${input.receiverDeviceGroup.groupId}-slot-${input.slotRoute.receiverSlot}`,
        displayName,
        transport: bindingTransport,
        receiverKind: input.receiverDeviceGroup.receiver.receiverKind,
        identity: {
            evidence: {
                kind: "vendorHid",
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
                modelId: deviceInformation?.modelId ?? input.slotRoute.modelId,
                receiverSlot: input.slotRoute.receiverSlot,
            },
        },
        supportState: "supported",
        isExperimental: true,
        batteryPercent: input.battery.reading.percent,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: input.receiverDeviceGroup.deviceInfoList
                .flatMap(deviceInfo => deviceInfo.path === undefined ? [] : [deviceInfo.path])
                .join(";"),
            receiverSlot: input.slotRoute.receiverSlot,
            batteryPercentSource: input.battery.reading.percentSource,
            batteryVoltageMillivolts: input.battery.reading.voltageMillivolts,
        },
    };
}

function buildDisplayName(input: {
    readonly receiver: LogitechReceiverDescriptor;
    readonly receiverSlot: number;
    readonly marketingName?: string;
    readonly deviceKind?: string;
}): string {
    if (input.marketingName !== undefined) {
        return input.marketingName;
    }

    if (input.deviceKind !== undefined) {
        return `${formatReceiverFamilyLabel(input.receiver)} ${formatDeviceKind(input.deviceKind)} (slot ${input.receiverSlot})`;
    }

    return `${input.receiver.displayPrefix} slot ${input.receiverSlot}`;
}

function formatReceiverFamilyLabel(receiver: LogitechReceiverDescriptor): string {
    return receiver.displayPrefix.endsWith(" device")
        ? receiver.displayPrefix.slice(0, -" device".length)
        : receiver.displayPrefix;
}

function formatDeviceKind(deviceKind: string): string {
    return deviceKind.replace(/[A-Z]/gu, match => ` ${match.toLowerCase()}`);
}

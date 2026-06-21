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
    const displayName = buildDisplayName(input.receiverDeviceGroup.receiver, input.slotRoute.receiverSlot);
    const bindingTransport: SystemPeripheralBindingTransport = "usbReceiver";
    const vendorUnitId = deviceInformation?.unitId ?? input.slotRoute.vendorUnitId;

    return {
        candidateId: `logitech-${input.receiverDeviceGroup.groupId}-slot-${input.slotRoute.receiverSlot}`,
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
            receiverSlot: input.slotRoute.receiverSlot,
        },
        supportState: "supported",
        isExperimental: true,
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

function buildDisplayName(
    receiver: LogitechReceiverDescriptor,
    receiverSlot: number,
): string {
    return `${receiver.displayPrefix} slot ${receiverSlot}`;
}

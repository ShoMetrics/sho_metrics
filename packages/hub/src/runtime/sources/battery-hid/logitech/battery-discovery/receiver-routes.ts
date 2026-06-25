import type { SystemPeripheralReceiverKind } from "../../../../../settings/resolved-settings";
import type { NativeHidDeviceInfo } from "../../native-hid-loader-internal";
import {
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_VENDOR_ID,
} from "../hidpp-protocol";

export interface LogitechReceiverDescriptor {
    readonly receiverKind: Extract<SystemPeripheralReceiverKind, "bolt" | "unifying" | "lightspeed">;
    readonly productId: number;
    readonly displayPrefix: string;
}

export interface LogitechReceiverDeviceGroup {
    readonly receiver: LogitechReceiverDescriptor;
    readonly groupId: string;
    readonly deviceInfoList: readonly NativeHidDeviceInfo[];
}

export interface LogitechReceiverSlotRoute {
    readonly receiverSlot: number;
    readonly vendorUnitId?: string;
    readonly modelId?: string;
    readonly wirelessProductId?: number;
    readonly deviceKind?: string;
}

/** Groups native HID collections that belong to the same receiver route. */
export function groupLogitechReceiverDevices(
    deviceInfoList: readonly NativeHidDeviceInfo[],
    receivers: readonly LogitechReceiverDescriptor[],
): readonly LogitechReceiverDeviceGroup[] {
    const deviceGroupsById = new Map<string, LogitechReceiverDeviceGroup>();

    for (const deviceInfo of deviceInfoList) {
        const receiver = receivers.find(candidateReceiver =>
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

export function formatHex(value: number | undefined): string {
    return value === undefined ? "unknown" : value.toString(16).padStart(4, "0");
}

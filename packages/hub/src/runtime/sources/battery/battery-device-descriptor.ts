import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";

export type BatteryDeviceTransport = "system" | SystemPeripheralBindingTransport;

export type BatteryDeviceSupportState =
    | "supported"
    | "experimental"
    | "unsupported"
    | "ambiguous"
    | "offline";

export interface BatteryDeviceDescriptor {
    /** Runtime-only descriptor id. This must not be a raw HID path. */
    readonly descriptorId: string;
    readonly displayName: string;
    readonly metricKey: string;
    readonly transport: BatteryDeviceTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly isExperimental: boolean;
    readonly identity: ResolvedSystemPeripheralIdentity | undefined;
    readonly supportState: BatteryDeviceSupportState;
}

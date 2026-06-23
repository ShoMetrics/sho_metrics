import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../settings/resolved-settings";
import { SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../../metric-keys";

export type BatteryDeviceTransport = "system" | SystemPeripheralBindingTransport;

export type BatteryDeviceSupportState =
    | "supported"
    | "experimental"
    | "unsupported"
    | "ambiguous"
    | "offline";

export interface BatteryDeviceDescriptor {
    /** Runtime-only descriptor id. This must not be a raw HID path or persisted as the binding identity. */
    readonly descriptorId: string;
    readonly displayName: string;
    /** Metric key derived from the persisted binding identity, not from session-only descriptor suffixes. */
    readonly metricKey: string;
    readonly transport: BatteryDeviceTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly isExperimental: boolean;
    readonly identity: ResolvedSystemPeripheralIdentity | undefined;
    /** `ambiguous` means multiple current candidates share this persisted identity fallback. */
    readonly supportState: BatteryDeviceSupportState;
    readonly diagnostics?: BatteryDeviceDescriptorDiagnostics;
}

export interface BatteryDeviceDescriptorDiagnostics {
    readonly candidateIds: readonly string[];
    readonly sourcePathIds: readonly string[];
    readonly receiverSlots: readonly number[];
    readonly easySwitchSlots: readonly number[];
    readonly batteryPercentSources: readonly BatteryDeviceBatteryPercentSource[];
    readonly batteryVoltageMillivolts: readonly number[];
}

export interface BatteryDeviceDiscoveryDiagnostics {
    readonly detectedCandidateCount: number;
    readonly displayedDescriptorCount: number;
    readonly hiddenCandidates: readonly BatteryDeviceHiddenCandidateDiagnostic[];
}

export interface BatteryDeviceHiddenCandidateDiagnostic {
    readonly candidateId: string;
    readonly displayName: string;
    readonly transport: BatteryDeviceTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly supportState: BatteryDeviceSupportState | "unknown";
    readonly reason: BatteryDeviceHiddenCandidateReason;
    readonly vendorId: number | undefined;
    readonly productId: number | undefined;
    readonly modelId: string | undefined;
    readonly manufacturer: string | undefined;
    readonly productName: string | undefined;
    readonly interfaceNumber: number | undefined;
    readonly usagePage: number | undefined;
    readonly usageId: number | undefined;
    readonly receiverSlot: number | undefined;
    readonly sourcePathId: string | undefined;
}

export type BatteryDeviceHiddenCandidateReason =
    | "experimentalDisabled"
    | "unsupported"
    | "unknownSupport";

export type BatteryDeviceBatteryPercentSource =
    | "reported"
    | "voltageEstimated";

export const SYSTEM_BATTERY_DEVICE_DESCRIPTOR: BatteryDeviceDescriptor = {
    descriptorId: "system",
    displayName: "System",
    metricKey: SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    transport: "system",
    receiverKind: undefined,
    isExperimental: false,
    identity: undefined,
    supportState: "supported",
};

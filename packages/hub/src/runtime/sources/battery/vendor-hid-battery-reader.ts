import type { NativeHidDeviceInfo } from "../battery-hid/native-hid-loader-internal";
import type { BatteryDeviceDiscoveryCandidate } from "./battery-device-discovery";

/**
 * Reads vendor-specific HID battery candidates from one already-enumerated HID device list.
 *
 * Vendor readers must not enumerate HID devices themselves. Native HID enumeration
 * is expensive and can contend with Stream Deck's own USB image uploads, so the
 * source client owns the single enumeration pass and hands the same snapshot to
 * each reader.
 */
export interface VendorHidBatteryReader {
    discoverBatteryDevices(deviceInfoList: readonly NativeHidDeviceInfo[]): Promise<readonly BatteryDeviceDiscoveryCandidate[]>;
    /**
     * Re-reads a device that was already discovered in this process.
     *
     * This is a direct read over cached route facts, not a fresh discovery. If
     * the vendor protocol exposes a live unit identity, the reader must verify
     * it before returning. If it does not, stale-binding protection must come
     * from exact HID path/route targeting plus strict protocol parsing; do not
     * add a cached identity self-compare that only compares the binding to
     * itself.
     */
    readBatteryDevice(metricKey: string): Promise<BatteryDeviceDiscoveryCandidate | undefined>;
}

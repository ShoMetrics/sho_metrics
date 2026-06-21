/**
 * Implements the `UnifiedBattery` feature (ID `0x1004`) that provides
 * information about the battery status of the device.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/feature/unified_battery/mod.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 *
 * DELIBERATE DIVERGENCE FROM OpenLogi:
 * `get_battery_info` rejects unknown level/status values with
 * `try_from -> UnsupportedResponse`. ShoMetrics must not mirror that API
 * policy in the battery reader: `chargingPercentage` is independent of
 * level/status, and dropping it silently loses battery readings on devices
 * whose status byte is outside the known enum. `BatteryStatus` is
 * `#[non_exhaustive]`, so parser output keeps raw level/status bytes and makes
 * decoded enum values optional.
 */

/**
 * Implements the `UnifiedBattery` / `0x1004` feature.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:UnifiedBatteryFeature`.
 */
export const OPENLOGI_UNIFIED_BATTERY_FEATURE_ID = 0x1004;
export const OPENLOGI_UNIFIED_BATTERY_STARTING_VERSION = 0;
export const OPENLOGI_UNIFIED_BATTERY_CAPABILITIES_FUNCTION_ID = 0x00;
export const OPENLOGI_UNIFIED_BATTERY_INFO_FUNCTION_ID = 0x01;

/**
 * Represents the capabilites of this feature and the battery itself.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryCapabilities`.
 */
export interface OpenLogiBatteryCapabilities {
    /**
     * All [`BatteryLevel`] variants the feature supports and reports.
     */
    readonly reportedLevels: ReadonlySet<OpenLogiBatteryLevel>;

    /**
     * Whether the battery is rechargeable.
     */
    readonly rechargeable: boolean;

    /**
     * Whether the device supports reporting the current battery charge
     * percentage in [`BatteryInfo::charging_percentage`].
     */
    readonly percentage: boolean;
}

/**
 * Represents infirmation about the current battery charge.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryInfo`.
 */
export interface OpenLogiBatteryInfo {
    /**
     * The current charge of the battery in percent.
     *
     * If [`BatteryCapabilities::percentage`] is set to `false`, this is always
     * zero.
     */
    readonly chargingPercentage: number;

    /**
     * The raw current approximate battery level byte.
     */
    readonly levelByte: number;

    /**
     * The current (approximate) level of the battery.
     *
     * This can only reach values present in
     * [`BatteryCapabilities::reported_levels`].
     */
    readonly level?: OpenLogiBatteryLevel;

    /**
     * The raw current charging status byte.
     */
    readonly statusByte: number;

    /**
     * The current charging status of the battery.
     */
    readonly status?: OpenLogiBatteryStatus;
}

/**
 * Represents an approximate level of the battery charge.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryLevel`.
 */
export type OpenLogiBatteryLevel = "critical" | "low" | "good" | "full";

/**
 * Represents the charging status of the battery.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryStatus`.
 */
export type OpenLogiBatteryStatus = "discharging" | "charging" | "chargingSlow" | "full" | "error";

/**
 * Parses the capabilities of this feature and the battery in general.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:UnifiedBatteryFeature::get_battery_capabilities`.
 */
export function parseOpenLogiBatteryCapabilitiesPayload(payload: readonly number[]): OpenLogiBatteryCapabilities {
    return parseOpenLogiBatteryCapabilities([payload[0] ?? 0, payload[1] ?? 0]);
}

/**
 * Decodes the capabilities of this feature and the battery itself.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:impl From<[u8; 2]> for BatteryCapabilities`.
 */
export function parseOpenLogiBatteryCapabilities(value: readonly [number, number]): OpenLogiBatteryCapabilities {
    const reportedLevels = new Set<OpenLogiBatteryLevel>();
    if ((value[0] & 1) !== 0) {
        reportedLevels.add("critical");
    }
    if ((value[0] & (1 << 1)) !== 0) {
        reportedLevels.add("low");
    }
    if ((value[0] & (1 << 2)) !== 0) {
        reportedLevels.add("good");
    }
    if ((value[0] & (1 << 3)) !== 0) {
        reportedLevels.add("full");
    }

    return {
        reportedLevels,
        rechargeable: (value[1] & 1) !== 0,
        percentage: (value[1] & (1 << 1)) !== 0,
    };
}

/**
 * Parses the current information about the battery status.
 *
 * payload[3] contains some kind of information about the status of the external
 * power source (maybe 0 = disconnected and 1 = connected, I don't have enough
 * info about that), according to https://github.com/torvalds/linux/blob/a8662bcd2ff152bfbc751cab20f33053d74d0963/drivers/hid/hid-logitech-hidpp.c#L1608
 * and
 * https://github.com/torvalds/linux/blob/a8662bcd2ff152bfbc751cab20f33053d74d0963/drivers/hid/hid-logitech-hidpp.c#L1679
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:UnifiedBatteryFeature::get_battery_info`.
 */
export function parseOpenLogiBatteryInfoPayload(payload: readonly number[]): OpenLogiBatteryInfo {
    const levelByte = payload[1] ?? 0;
    const statusByte = payload[2] ?? 0;
    return {
        chargingPercentage: payload[0] ?? 0,
        levelByte,
        level: parseOpenLogiBatteryLevel(levelByte),
        statusByte,
        status: parseOpenLogiBatteryStatus(statusByte),
    };
}

/**
 * Decodes an approximate battery charge level.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryLevel`.
 */
export function parseOpenLogiBatteryLevel(value: number): OpenLogiBatteryLevel | undefined {
    switch (value) {
        case 1:
            return "critical";
        case 1 << 1:
            return "low";
        case 1 << 2:
            return "good";
        case 1 << 3:
            return "full";
        default:
            return undefined;
    }
}

/**
 * Encodes an approximate battery charge level.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryLevel` `IntoPrimitive`.
 */
export function encodeOpenLogiBatteryLevel(value: OpenLogiBatteryLevel): number {
    switch (value) {
        case "critical":
            return 1;
        case "low":
            return 1 << 1;
        case "good":
            return 1 << 2;
        case "full":
            return 1 << 3;
    }
}

/**
 * Decodes the charging status of the battery.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryStatus`.
 */
export function parseOpenLogiBatteryStatus(value: number): OpenLogiBatteryStatus | undefined {
    switch (value) {
        case 0:
            return "discharging";
        case 1:
            return "charging";
        case 2:
            return "chargingSlow";
        case 3:
            return "full";
        case 4:
            return "error";
        default:
            return undefined;
    }
}

/**
 * Encodes the charging status of the battery.
 *
 * Source: OpenLogi `feature/unified_battery/mod.rs:BatteryStatus` `IntoPrimitive`.
 */
export function encodeOpenLogiBatteryStatus(value: OpenLogiBatteryStatus): number {
    switch (value) {
        case "discharging":
            return 0;
        case "charging":
            return 1;
        case "chargingSlow":
            return 2;
        case "full":
            return 3;
        case "error":
            return 4;
    }
}

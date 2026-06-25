import type { ResolvedSystemPeripheralIdentity } from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import type { SelectOption } from "../inspector/types";

/**
 * Lists safe polling choices for vendor HID peripheral battery reads.
 *
 * Vendor HID devices can share queues with manufacturer software, so the PI
 * intentionally prevents short polling intervals when such a device is selected.
 */
export const VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS = [
    { value: 600, label: "10m" },
    { value: 1200, label: "20m" },
    { value: 1800, label: "30m" },
    { value: 3600, label: "60m" },
] as const satisfies readonly SelectOption<number>[];

/** Lists polling choices for OS-provided battery values, including Bluetooth. */
export const SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS = [
    { value: 60, label: "60s" },
    { value: 180, label: "3m" },
    { value: 300, label: "5m" },
    { value: 600, label: "10m" },
    { value: 1200, label: "20m" },
    { value: 1800, label: "30m" },
    { value: 3600, label: "60m" },
] as const satisfies readonly SelectOption<number>[];

/** Resolves the polling choices for a selected system battery target. */
export function resolveBatteryPollingFrequencyOptions(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
): readonly SelectOption<number>[] {
    return readSystemVendorHidPeripheralIdentity(peripheralIdentity) === undefined
        ? SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS
        : VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS;
}

/** Resolves the minimum polling interval required by a selected system battery target. */
export function resolveMinimumBatteryPollingFrequencySeconds(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
): number {
    return resolveBatteryPollingFrequencyOptions(peripheralIdentity)[0].value;
}

/**
 * Resolves the shared Stacked polling choices from the slowest configured slot.
 *
 * Stacked uses one widget-level polling interval for all slots. Adding a slower
 * battery slot raises the allowed interval floor; removing that slot does not
 * automatically restore an older faster value because the previous value is not
 * tracked as user intent.
 */
export function resolveBatteryPollingFrequencyOptionsForMinimum(
    minimumPollingFrequencySeconds: number,
): readonly SelectOption<number>[] | undefined {
    if (minimumPollingFrequencySeconds >= VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS[0].value) {
        return VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS;
    }

    if (minimumPollingFrequencySeconds >= SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS[0].value) {
        return SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS;
    }

    return undefined;
}

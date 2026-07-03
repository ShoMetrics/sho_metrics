import type { ResolvedSystemPeripheralIdentity } from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import {
    SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS,
    VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS,
} from "../../settings/polling-frequency-options";
import type { SelectOption } from "../inspector/types";
import { pollingFrequencyOptionList } from "./setting-options";

/**
 * Lists safe polling choices for vendor HID peripheral battery reads.
 *
 * Vendor HID devices can share queues with manufacturer software, so the PI
 * intentionally prevents short polling intervals when such a device is selected.
 */
export const VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS = [
    ...VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS.map(value => ({
        value,
        label: formatBatteryPollingFrequencyLabel(value),
    })),
] as const satisfies readonly SelectOption<number>[];

/** Lists polling choices for OS-provided battery values, including Bluetooth. */
export const SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS = [
    ...SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS.map(value => ({
        value,
        label: formatBatteryPollingFrequencyLabel(value),
    })),
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
export function resolveBatteryPollingFrequencyOptionsForMinimum(options: {
    readonly minimumPollingFrequencySeconds: number;
    readonly currentPollingFrequencySeconds: number;
}): readonly SelectOption<number>[] | undefined {
    if (options.minimumPollingFrequencySeconds >= VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS[0].value) {
        return VENDOR_HID_BATTERY_POLLING_FREQUENCY_OPTIONS;
    }

    if (
        options.minimumPollingFrequencySeconds >= SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS[0].value
    ) {
        return SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS;
    }

    // The battery slot is gone (floor dropped to the fast range) but the saved
    // value is still a battery-range frequency. Show the standard fast list so
    // the user can lower it, and append the saved value as a disabled option so
    // SelectSetting displays the real stored value instead of silently rendering
    // it as the first fast option (which looked like an unwanted reset to 1s).
    const currentSlowOption = SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS.find(
        option => option.value === options.currentPollingFrequencySeconds,
    );
    if (currentSlowOption !== undefined) {
        return [
            ...pollingFrequencyOptionList,
            {
                ...currentSlowOption,
                disabled: true,
            },
        ];
    }

    return undefined;
}

function formatBatteryPollingFrequencyLabel(value: number): string {
    return value <= 60 ? `${value}s` : `${value / 60}m`;
}

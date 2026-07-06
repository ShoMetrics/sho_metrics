import type { ResolvedSystemPeripheralIdentity } from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import {
    SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS,
    VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS,
} from "../../settings/polling-frequency-options";
import type { SelectOption } from "../inspector/types";
import {
    buildPollingFrequencyOptionList,
    formatDurationOptionLabel,
    type OptionLabelFormatter,
} from "./setting-options";
import { preserveMissingCurrentOption } from "../select-options/preserve-current-option";

/**
 * Lists safe polling choices for vendor HID peripheral battery reads.
 *
 * Vendor HID devices can share queues with manufacturer software, so the PI
 * intentionally prevents short polling intervals when such a device is selected.
 */
export function buildVendorHidBatteryPollingFrequencyOptions(t: OptionLabelFormatter): readonly SelectOption<number>[] {
    return VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS.map(value => ({
        value,
        label: formatDurationOptionLabel(t, value),
    }));
}

/** Lists polling choices for OS-provided battery values, including Bluetooth. */
export function buildSystemBatteryPollingFrequencyOptions(t: OptionLabelFormatter): readonly SelectOption<number>[] {
    return SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS.map(value => ({
        value,
        label: formatDurationOptionLabel(t, value),
    }));
}

/** Resolves the polling choices for a selected system battery target. */
export function resolveBatteryPollingFrequencyOptions(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
    t: OptionLabelFormatter,
): readonly SelectOption<number>[] {
    return readSystemVendorHidPeripheralIdentity(peripheralIdentity) === undefined
        ? buildSystemBatteryPollingFrequencyOptions(t)
        : buildVendorHidBatteryPollingFrequencyOptions(t);
}

/** Resolves the minimum polling interval required by a selected system battery target. */
export function resolveMinimumBatteryPollingFrequencySeconds(
    peripheralIdentity: ResolvedSystemPeripheralIdentity | undefined,
): number {
    return readSystemVendorHidPeripheralIdentity(peripheralIdentity) === undefined
        ? SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS[0]
        : VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS[0];
}

/**
 * Resolves the shared Stacked/Dense polling choices from the slowest configured slot.
 *
 * These widgets use one polling interval for all slots. Adding a slower battery
 * slot raises the allowed interval floor; removing that slot does not
 * automatically restore an older faster value because the previous value is not
 * tracked as user intent.
 */
export function resolveBatteryPollingFrequencyOptionsForMinimum(options: {
    readonly minimumPollingFrequencySeconds: number;
    readonly currentPollingFrequencySeconds: number;
    readonly t: OptionLabelFormatter;
}): readonly SelectOption<number>[] | undefined {
    if (options.minimumPollingFrequencySeconds >= VENDOR_HID_BATTERY_POLLING_FREQUENCY_SECONDS[0]) {
        return buildVendorHidBatteryPollingFrequencyOptions(options.t);
    }

    if (
        options.minimumPollingFrequencySeconds >= SYSTEM_BATTERY_POLLING_FREQUENCY_SECONDS[0]
    ) {
        return buildSystemBatteryPollingFrequencyOptions(options.t);
    }

    // The battery slot is gone (floor dropped to the fast range) but the saved
    // value is still a battery-range frequency. Show the standard fast list so
    // the user can lower it, and append the saved value as a disabled option so
    // SelectSetting displays the real stored value instead of silently rendering
    // it as the first fast option (which looked like an unwanted reset to 1s).
    const pollingFrequencyOptionList = buildPollingFrequencyOptionList(options.t);
    const systemBatteryPollingFrequencyOptions = buildSystemBatteryPollingFrequencyOptions(options.t);
    const optionList = preserveMissingCurrentOption({
        optionList: pollingFrequencyOptionList,
        currentValue: options.currentPollingFrequencySeconds,
        placement: "end",
        resolveCurrentOption: currentValue => {
            const currentSlowOption = systemBatteryPollingFrequencyOptions.find(
                option => option.value === currentValue,
            );

            return currentSlowOption === undefined
                ? undefined
                : { ...currentSlowOption, disabled: true };
        },
    });

    return optionList.length === pollingFrequencyOptionList.length
        ? undefined
        : optionList;
}

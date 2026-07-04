import type { SelectOption, SelectOptionValue } from "../inspector/types";

/**
 * Preserves a stored select value that disappeared from a dynamic option list.
 *
 * This keeps the Property Inspector honest for runtime-owned lists such as
 * disks, network interfaces, and slow polling options: the UI should show the
 * stored value explicitly instead of silently rendering the first enabled
 * option.
 */
export function preserveMissingCurrentOption<TValue extends SelectOptionValue>(options: {
    readonly optionList: readonly SelectOption<TValue>[];
    readonly currentValue: TValue | undefined;
    readonly resolveCurrentOption: (currentValue: TValue) => SelectOption<TValue> | undefined;
    readonly placement: "start" | "end";
}): readonly SelectOption<TValue>[] {
    if (
        options.currentValue === undefined
        || options.optionList.some(option => option.value === options.currentValue)
    ) {
        return options.optionList;
    }

    const currentOption = options.resolveCurrentOption(options.currentValue);
    if (currentOption === undefined) {
        return options.optionList;
    }

    return options.placement === "start"
        ? [currentOption, ...options.optionList]
        : [...options.optionList, currentOption];
}

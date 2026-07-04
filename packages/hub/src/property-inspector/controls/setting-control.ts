import type { SelectOption, SelectOptionValue } from "../inspector/types";

export interface SettingControlProps {
    disabled?: boolean;
}

export function isOptionDisabled<TValue extends SelectOptionValue>(option: SelectOption<TValue>): boolean {
    return option.disabled === true;
}

export function resolveSelectedOptionValue<TValue extends SelectOptionValue>(options: {
    optionList: readonly SelectOption<TValue>[];
    value: TValue;
}): TValue | "" {
    if (options.optionList.some((option) => option.value === options.value)) {
        return options.value;
    }

    // Generic controls do not know whether a missing value is stale runtime
    // state, unsupported platform state, or an illegal setting. Dynamic option
    // builders that must preserve the stored value should add an explicit
    // preserved option before reaching this generic fallback.
    return options.optionList.find(isSelectableOption)?.value ?? "";
}

function isSelectableOption<TValue extends SelectOptionValue>(option: SelectOption<TValue>): boolean {
    return !isOptionDisabled(option);
}

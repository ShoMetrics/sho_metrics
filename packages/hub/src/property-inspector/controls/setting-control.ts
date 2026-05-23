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
    if (options.optionList.some((option) => option.value === options.value && isSelectableOption(option))) {
        return options.value;
    }

    return options.optionList.find(isSelectableOption)?.value ?? "";
}

function isSelectableOption<TValue extends SelectOptionValue>(option: SelectOption<TValue>): boolean {
    return !isOptionDisabled(option);
}

import type { SelectOption } from "../types";

export interface SettingControlProps {
    disabled?: boolean;
}

export function isOptionDisabled(option: SelectOption): boolean {
    return option.disabled === true;
}

export function resolveSelectedOptionValue<TValue extends string>(options: {
    optionList: readonly SelectOption<TValue>[];
    value: TValue;
}): TValue | "" {
    if (options.optionList.some((option) => option.value === options.value && isSelectableOption(option))) {
        return options.value;
    }

    return options.optionList.find(isSelectableOption)?.value ?? "";
}

function isSelectableOption(option: SelectOption): boolean {
    return !isOptionDisabled(option);
}

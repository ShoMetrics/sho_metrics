import type {
    InspectorSettingTarget,
    PropertyInspectorSettingKey,
    SelectOption,
    VisibilityContext,
} from "../schema";

export interface SettingControlProps {
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    disabled?: boolean;
}

export interface ScalarSettingControlProps extends SettingControlProps {
    target: PropertyInspectorSettingKey;
}

export function isOptionDisabled(option: SelectOption): boolean {
    return option.disabled === true;
}

export function resolveSelectedOptionValue(options: {
    optionList: readonly SelectOption[];
    value: string;
}): string {
    if (options.optionList.some((option) => option.value === options.value && isSelectableOption(option))) {
        return options.value;
    }

    return options.optionList.find(isSelectableOption)?.value ?? "";
}

function isSelectableOption(option: SelectOption): boolean {
    return !isOptionDisabled(option);
}

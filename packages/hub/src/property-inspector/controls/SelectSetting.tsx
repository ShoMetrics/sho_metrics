import { InspectorItem } from "../components/InspectorItem";
import { resolveSettingTargetName, type SelectOption } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import {
    isOptionDisabled,
    resolveSelectedOptionValue,
    type ScalarSettingControlProps,
} from "./setting-control";

interface SelectSettingProps extends ScalarSettingControlProps {
    label: string;
    optionList: readonly SelectOption[];
}

export function SelectSetting({
    target,
    label,
    optionList,
    context,
    onSettingChange,
    disabled = false,
}: SelectSettingProps): React.JSX.Element {
    const selectedValue = resolveSelectedOptionValue({
        optionList,
        value: String(readInspectorControlValue(context, target)),
    });

    return (
        <InspectorItem label={label}>
            <select
                className="native-select"
                data-setting-target={resolveSettingTargetName(target)}
                value={selectedValue}
                disabled={disabled}
                onChange={(event) => onSettingChange(target, event.currentTarget.value)}
            >
                {optionList.map((option) => (
                    <option
                        key={option.value}
                        value={option.value}
                        disabled={isOptionDisabled(option)}
                    >
                        {option.label}
                    </option>
                ))}
            </select>
        </InspectorItem>
    );
}

import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../types";
import {
    isOptionDisabled,
    resolveSelectedOptionValue,
    type SettingControlProps,
} from "./setting-control";

interface SelectSettingProps<TValue extends string> extends SettingControlProps {
    label: string;
    value: TValue;
    optionList: readonly SelectOption<TValue>[];
    onValueChange: (value: TValue) => void;
}

export function SelectSetting<TValue extends string>({
    label,
    value,
    optionList,
    onValueChange,
    disabled = false,
}: SelectSettingProps<TValue>): React.JSX.Element {
    const inputId = useId();
    const selectedValue = resolveSelectedOptionValue({
        optionList,
        value,
    });

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <select
                id={inputId}
                className="native-select"
                value={selectedValue}
                disabled={disabled}
                onChange={(event) => onValueChange(event.currentTarget.value as TValue)}
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

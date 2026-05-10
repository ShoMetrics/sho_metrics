import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../inspector/types";
import {
    isOptionDisabled,
    readSelectedOptionValue,
    resolveSelectedOptionValue,
    type SettingControlProps,
} from "./setting-control";
import type { SelectOptionValue } from "../inspector/types";

interface SelectSettingProps<TValue extends SelectOptionValue> extends SettingControlProps {
    label: string;
    value: TValue;
    optionList: readonly SelectOption<TValue>[];
    onValueChange: (value: TValue) => void;
}

export function SelectSetting<TValue extends SelectOptionValue>({
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
                value={String(selectedValue)}
                disabled={disabled}
                onChange={(event) => {
                    const selectedOptionValue = readSelectedOptionValue({
                        optionList,
                        rawValue: event.currentTarget.value,
                    });

                    if (selectedOptionValue !== undefined) {
                        onValueChange(selectedOptionValue);
                    }
                }}
            >
                {optionList.map((option) => (
                    <option
                        key={option.value}
                        value={String(option.value)}
                        disabled={isOptionDisabled(option)}
                    >
                        {option.label}
                    </option>
                ))}
            </select>
        </InspectorItem>
    );
}

import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../types";
import {
    isOptionDisabled,
    resolveSelectedOptionValue,
    type SettingControlProps,
} from "./setting-control";

interface PreviewOptionSettingProps<TValue extends string> extends SettingControlProps {
    label: string;
    value: TValue;
    optionList: readonly SelectOption<TValue>[];
    buildPreviewUri: (value: TValue) => string;
    onValueChange: (value: TValue) => void;
}

export function PreviewOptionSetting<TValue extends string>({
    label,
    value,
    optionList,
    buildPreviewUri,
    onValueChange,
    disabled = false,
}: PreviewOptionSettingProps<TValue>): React.JSX.Element {
    const selectedValue = resolveSelectedOptionValue({
        optionList,
        value,
    });

    return (
        <InspectorItem label={label}>
            <div className="graphic-type-picker" role="radiogroup" aria-label={label}>
                {optionList.map((option) => {
                    const optionDisabled = disabled || isOptionDisabled(option);

                    return (
                        <button
                            key={option.value}
                            type="button"
                            className="graphic-type-option"
                            data-selected={selectedValue === option.value ? "true" : "false"}
                            data-disabled={optionDisabled ? "true" : "false"}
                            disabled={optionDisabled}
                            role="radio"
                            aria-checked={selectedValue === option.value}
                            onClick={() => onValueChange(option.value)}
                        >
                            <img
                                className="graphic-type-preview"
                                src={buildPreviewUri(option.value)}
                                alt=""
                                aria-hidden="true"
                            />
                            <span className="graphic-type-label">{option.label}</span>
                        </button>
                    );
                })}
            </div>
        </InspectorItem>
    );
}

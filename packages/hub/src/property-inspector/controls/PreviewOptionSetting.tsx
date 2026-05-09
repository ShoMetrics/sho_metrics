import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import {
    isOptionDisabled,
    resolveSelectedOptionValue,
    type ScalarSettingControlProps,
} from "./setting-control";

interface PreviewOptionSettingProps extends ScalarSettingControlProps {
    label: string;
    optionList: readonly SelectOption[];
    buildPreviewUri: (value: string) => string;
}

export function PreviewOptionSetting({
    target,
    label,
    optionList,
    buildPreviewUri,
    context,
    onSettingChange,
    disabled = false,
}: PreviewOptionSettingProps): React.JSX.Element {
    const selectedValue = resolveSelectedOptionValue({
        optionList,
        value: String(readInspectorControlValue(context, target)),
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
                            onClick={() => onSettingChange(target, option.value)}
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

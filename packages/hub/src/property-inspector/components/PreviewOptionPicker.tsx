import {
    isFieldDisabled,
    isOptionDisabled,
    isOptionHidden,
    resolveSelectedOptionValue,
    resolveSelectOptions,
} from "./field-options";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface PreviewOptionPickerProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
    buildPreviewUri: (value: string) => string;
    disabled?: boolean;
}

export function PreviewOptionPicker({
    field,
    context,
    onSettingChange,
    buildPreviewUri,
    disabled = false,
}: PreviewOptionPickerProps): React.JSX.Element {
    const options = resolveSelectOptions(field, context);
    const selectedValue = resolveSelectedOptionValue({
        context,
        options,
        value: String(context.settings[field.key]),
        fallbackValue: field.defaultValue == null ? undefined : String(field.defaultValue),
    });
    const isDisabled = disabled || isFieldDisabled(field, context);

    return (
        <div className="graphic-type-picker" role="radiogroup" aria-label={field.label ?? field.id}>
            {options.map((fieldOption) => {
                const isHidden = isOptionHidden(fieldOption, context);
                const optionDisabled = isDisabled || isOptionDisabled(fieldOption, context);

                if (isHidden) {
                    return null;
                }

                return (
                    <button
                        key={fieldOption.value}
                        type="button"
                        className="graphic-type-option"
                        data-selected={selectedValue === fieldOption.value ? "true" : "false"}
                        data-disabled={optionDisabled ? "true" : "false"}
                        disabled={optionDisabled}
                        role="radio"
                        aria-checked={selectedValue === fieldOption.value}
                        onClick={() => onSettingChange(field.key, fieldOption.value)}
                    >
                        <img
                            className="graphic-type-preview"
                            src={buildPreviewUri(fieldOption.value)}
                            alt=""
                            aria-hidden="true"
                        />
                        <span className="graphic-type-label">{fieldOption.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

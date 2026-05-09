import { isFieldDisabled, isOptionDisabled, isOptionHidden, resolveSelectedOptionValue, resolveSelectOptions } from "./field-options";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface SelectFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function SelectField({ field, context, disabled = false }: SelectFieldProps): React.JSX.Element {
    const options = resolveSelectOptions(field, context);
    const selectedValue = resolveSelectedOptionValue({
        context,
        options,
        value: String(readInspectorControlValue(context, field.key)),
        fallbackValue: field.defaultValue == null ? undefined : String(field.defaultValue),
    });

    return (
        <select
            id={field.id}
            className="native-select"
            data-setting-key={field.key}
            value={selectedValue}
            disabled={disabled || isFieldDisabled(field, context)}
            onChange={() => undefined}
        >
            {options.map((fieldOption) => (
                <option
                    key={fieldOption.value}
                    value={fieldOption.value}
                    disabled={isOptionDisabled(fieldOption, context)}
                    hidden={isOptionHidden(fieldOption, context)}
                >
                    {fieldOption.label}
                </option>
            ))}
        </select>
    );
}

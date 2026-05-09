import { isFieldDisabled } from "./field-options";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface NumberFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function NumberField({ field, context, disabled = false }: NumberFieldProps): React.JSX.Element {
    return (
        <input
            id={field.id}
            className="native-input"
            type="number"
            data-setting-key={field.key}
            min={field.minimum}
            step={field.step}
            value={String(readInspectorControlValue(context, field.key) ?? "")}
            disabled={disabled || isFieldDisabled(field, context)}
            onChange={() => undefined}
        />
    );
}

import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface ColorFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function ColorField({ field, context, disabled = false }: ColorFieldProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, field.key) ?? field.defaultValue ?? "");

    return (
        <sdpi-color
            id={field.id}
            data-setting-key={field.key}
            default={String(field.defaultValue ?? value)}
            value={value}
            disabled={disabled}
        />
    );
}

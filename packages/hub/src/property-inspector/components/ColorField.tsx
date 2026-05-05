import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface ColorFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
}

export function ColorField({ field, context }: ColorFieldProps): React.JSX.Element {
    const value = String(context.settings[field.key] ?? field.defaultValue ?? "");

    return (
        <sdpi-color
            id={field.id}
            data-setting-key={field.key}
            default={String(field.defaultValue ?? value)}
            value={value}
        />
    );
}

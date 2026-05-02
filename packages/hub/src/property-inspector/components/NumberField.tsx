import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface NumberFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
}

export function NumberField({ field, context }: NumberFieldProps): React.JSX.Element {
    return (
        <input
            id={field.id}
            className="native-input"
            type="number"
            data-setting-key={field.key}
            min={field.minimum}
            step={field.step}
            value={String(context.settings[field.key] ?? "")}
            onChange={() => undefined}
        />
    );
}

import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface RangeFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function RangeField({ field, context, disabled = false }: RangeFieldProps): React.JSX.Element {
    const value = String(context.settings[field.key] ?? field.defaultValue ?? 0);

    return (
        <div className="range-control">
            <input
                id={field.id}
                type="range"
                data-setting-key={field.key}
                min={field.minimum ?? 0}
                max={field.maximum ?? 100}
                step={field.step ?? 1}
                value={value}
                disabled={disabled}
                onChange={() => undefined}
            />
            <span className="range-value">{value}%</span>
        </div>
    );
}

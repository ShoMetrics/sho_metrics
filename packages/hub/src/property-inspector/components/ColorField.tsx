import type { AppearanceColorBinding, FieldSchema, InspectorSettingTarget, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface ColorFieldProps {
    field: FieldSchema & { colorBinding: AppearanceColorBinding };
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    disabled?: boolean;
}

export function ColorField({ field, context, onSettingChange, disabled = false }: ColorFieldProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, field.colorBinding) ?? field.defaultValue ?? "");
    const handleColorChange = (event: React.SyntheticEvent): void => {
        const target = event.target as { value?: string };
        onSettingChange(field.colorBinding, String(target.value ?? ""));
    };

    return (
        <sdpi-color
            id={field.id}
            default={String(field.defaultValue ?? value)}
            value={value}
            disabled={disabled}
            onInput={handleColorChange}
            onChange={handleColorChange}
        />
    );
}

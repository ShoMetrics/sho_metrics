import type { AppearanceColorBinding, FieldSchema, InspectorSettingTarget, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import { NativeColorInput } from "./NativeColorInput";

interface ColorFieldProps {
    field: FieldSchema & { colorBinding: AppearanceColorBinding };
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    disabled?: boolean;
}

export function ColorField({ field, context, onSettingChange, disabled = false }: ColorFieldProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, field.colorBinding) ?? field.defaultValue ?? "");

    return (
        <NativeColorInput
            id={field.id}
            value={value}
            disabled={disabled}
            onValueChange={(nextValue) => onSettingChange(field.colorBinding, nextValue)}
        />
    );
}

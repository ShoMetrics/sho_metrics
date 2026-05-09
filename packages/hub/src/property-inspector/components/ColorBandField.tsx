import type { AppearanceColorBinding, FieldSchema, InspectorSettingTarget, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface ColorBandFieldProps {
    field: FieldSchema & { colorBinding: AppearanceColorBinding };
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    disabled?: boolean;
}

export function ColorBandField({ field, context, onSettingChange, disabled = false }: ColorBandFieldProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, field.colorBinding));
    const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        onSettingChange(field.colorBinding, event.currentTarget.value);
    };

    return (
        <div className="color-band-control">
            <label className="usage-range" style={{ backgroundColor: value }}>
                <span>{resolveColorBandText(field.colorBinding, context)}</span>
                <input
                    id={field.id}
                    type="color"
                    value={value}
                    disabled={disabled}
                    onChange={handleColorChange}
                />
            </label>
        </div>
    );
}

function resolveColorBandText(binding: AppearanceColorBinding, context: VisibilityContext): string {
    if (binding.colorKey === "lowColor") {
        return `0-${readInspectorControlValue(context, "lowThreshold")}%`;
    }

    if (binding.colorKey === "mediumColor") {
        return `${readInspectorControlValue(context, "lowThreshold")}-${readInspectorControlValue(context, "highThreshold")}%`;
    }

    if (binding.colorKey === "highColor") {
        return `${readInspectorControlValue(context, "highThreshold")}-100%`;
    }

    return "";
}

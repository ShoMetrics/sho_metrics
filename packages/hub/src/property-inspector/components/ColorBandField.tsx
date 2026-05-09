import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";

interface ColorBandFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function ColorBandField({ field, context, disabled = false }: ColorBandFieldProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, field.key));

    return (
        <div className="color-band-control">
            <label className="usage-range" style={{ backgroundColor: value }}>
                <span>{resolveColorBandText(field.key, context)}</span>
                <input
                    id={field.id}
                    type="color"
                    data-setting-key={field.key}
                    value={value}
                    disabled={disabled}
                    onChange={() => undefined}
                />
            </label>
        </div>
    );
}

function resolveColorBandText(key: PropertyInspectorSettingKey, context: VisibilityContext): string {
    if (key === "colorLow") {
        return `0-${readInspectorControlValue(context, "lowThreshold")}%`;
    }

    if (key === "colorMedium") {
        return `${readInspectorControlValue(context, "lowThreshold")}-${readInspectorControlValue(context, "highThreshold")}%`;
    }

    if (key === "colorHigh") {
        return `${readInspectorControlValue(context, "highThreshold")}-100%`;
    }

    return "";
}

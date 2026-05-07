import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface ColorBandFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    disabled?: boolean;
}

export function ColorBandField({ field, context, disabled = false }: ColorBandFieldProps): React.JSX.Element {
    const value = String(context.settings[field.key]);

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
        return `0-${context.settings.lowThreshold}%`;
    }

    if (key === "colorMedium") {
        return `${context.settings.lowThreshold}-${context.settings.highThreshold}%`;
    }

    if (key === "colorHigh") {
        return `${context.settings.highThreshold}-100%`;
    }

    return "";
}

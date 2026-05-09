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
    const textColor = resolveReadableTextColor(value);
    const handleColorChange = (event: React.FormEvent<HTMLInputElement>): void => {
        onSettingChange(field.colorBinding, event.currentTarget.value);
    };

    return (
        <div className="color-band-control">
            <label className="usage-range" style={{ backgroundColor: value, color: textColor }}>
                <span>{resolveColorBandText(field.colorBinding, context)}</span>
                <input
                    id={field.id}
                    type="color"
                    value={value}
                    disabled={disabled}
                    onInput={handleColorChange}
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

function resolveReadableTextColor(backgroundColor: string): "#111827" | "#ffffff" {
    const colorChannels = parseHexColorChannels(backgroundColor);

    if (!colorChannels) {
        return "#111827";
    }

    const luminance = resolveRelativeLuminance(colorChannels);
    const blackContrastRatio = (luminance + 0.05) / 0.05;
    const whiteContrastRatio = 1.05 / (luminance + 0.05);
    return whiteContrastRatio > blackContrastRatio ? "#ffffff" : "#111827";
}

function parseHexColorChannels(color: string): { red: number; green: number; blue: number } | undefined {
    const colorMatch = /^#([0-9a-f]{6})$/i.exec(color.trim());

    if (!colorMatch) {
        return undefined;
    }

    return {
        red: parseInt(colorMatch[1].slice(0, 2), 16),
        green: parseInt(colorMatch[1].slice(2, 4), 16),
        blue: parseInt(colorMatch[1].slice(4, 6), 16),
    };
}

function resolveRelativeLuminance(color: { red: number; green: number; blue: number }): number {
    return 0.2126 * resolveLinearColorChannel(color.red)
        + 0.7152 * resolveLinearColorChannel(color.green)
        + 0.0722 * resolveLinearColorChannel(color.blue);
}

function resolveLinearColorChannel(channelValue: number): number {
    const normalizedValue = channelValue / 255;
    return normalizedValue <= 0.03928
        ? normalizedValue / 12.92
        : ((normalizedValue + 0.055) / 1.055) ** 2.4;
}

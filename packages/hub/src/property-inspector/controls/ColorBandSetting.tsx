import { useId } from "react";
import { resolveReadableTextColor } from "../../shared/color-utils";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface ColorBandSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    bandText: string;
}

export function ColorBandSetting({
    label,
    value,
    onValueChange,
    bandText,
    disabled = false,
}: ColorBandSettingProps): React.JSX.Element {
    const inputId = useId();
    const textColor = resolveReadableTextColor(value);
    const handleColorChange = (event: React.FormEvent<HTMLInputElement>): void => {
        onValueChange(event.currentTarget.value);
    };

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <div className="color-band-control">
                <label className="usage-range" style={{ backgroundColor: value, color: textColor }}>
                    <span>{bandText}</span>
                    <input
                        id={inputId}
                        type="color"
                        value={value}
                        disabled={disabled}
                        onInput={handleColorChange}
                        onChange={handleColorChange}
                    />
                </label>
            </div>
        </InspectorItem>
    );
}

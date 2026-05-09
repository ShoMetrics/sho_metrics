import { resolveReadableTextColor } from "../../shared/color-utils";
import { resolveSettingTargetName, type AppearanceColorTarget } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface ColorBandSettingProps extends SettingControlProps {
    target: AppearanceColorTarget;
    label: string;
    bandText: string;
}

export function ColorBandSetting({
    target,
    label,
    bandText,
    context,
    onSettingChange,
    disabled = false,
}: ColorBandSettingProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, target));
    const textColor = resolveReadableTextColor(value);
    const handleColorChange = (event: React.FormEvent<HTMLInputElement>): void => {
        onSettingChange(target, event.currentTarget.value);
    };

    return (
        <InspectorItem label={label}>
            <div className="color-band-control">
                <label className="usage-range" style={{ backgroundColor: value, color: textColor }}>
                    <span>{bandText}</span>
                    <input
                        type="color"
                        data-setting-target={resolveSettingTargetName(target)}
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

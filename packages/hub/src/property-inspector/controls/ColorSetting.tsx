import { InspectorItem } from "../components/InspectorItem";
import { NativeColorInput } from "../components/NativeColorInput";
import { resolveSettingTargetName, type AppearanceColorTarget } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import type { SettingControlProps } from "./setting-control";

interface ColorSettingProps extends SettingControlProps {
    target: AppearanceColorTarget;
    label: string;
}

export function ColorSetting({
    target,
    label,
    context,
    onSettingChange,
    disabled = false,
}: ColorSettingProps): React.JSX.Element {
    return (
        <InspectorItem label={label}>
            <NativeColorInput
                dataSettingTarget={resolveSettingTargetName(target)}
                value={String(readInspectorControlValue(context, target) ?? "")}
                disabled={disabled}
                onValueChange={(nextValue) => onSettingChange(target, nextValue)}
            />
        </InspectorItem>
    );
}

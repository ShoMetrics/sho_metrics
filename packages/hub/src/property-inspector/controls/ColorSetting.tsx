import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { NativeColorInput } from "../components/NativeColorInput";
import type { SettingControlProps } from "./setting-control";

interface ColorSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
}

export function ColorSetting({
    label,
    value,
    onValueChange,
    disabled = false,
}: ColorSettingProps): React.JSX.Element {
    const inputId = useId();

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <NativeColorInput
                id={inputId}
                value={value}
                disabled={disabled}
                onValueChange={onValueChange}
            />
        </InspectorItem>
    );
}

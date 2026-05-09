import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface NumberSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    minimum?: number;
    step?: number;
}

export function NumberSetting({
    label,
    value,
    onValueChange,
    minimum,
    step,
    disabled = false,
}: NumberSettingProps): React.JSX.Element {
    const inputId = useId();

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <input
                id={inputId}
                className="native-input"
                type="number"
                min={minimum}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(event) => onValueChange(event.currentTarget.value)}
            />
        </InspectorItem>
    );
}

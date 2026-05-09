import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface TextSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    actionButton?: React.JSX.Element;
}

export function TextSetting({
    label,
    value,
    onValueChange,
    placeholder,
    actionButton,
    disabled = false,
}: TextSettingProps): React.JSX.Element {
    const inputId = useId();
    const input = (
        <input
            id={inputId}
            className="native-input"
            type="text"
            placeholder={placeholder ?? ""}
            value={value}
            disabled={disabled}
            onChange={(event) => onValueChange(event.currentTarget.value)}
        />
    );

    return (
        <InspectorItem label={label} labelFor={inputId}>
            {actionButton ? (
                <div className="text-field-with-action">
                    {input}
                    {actionButton}
                </div>
            ) : input}
        </InspectorItem>
    );
}

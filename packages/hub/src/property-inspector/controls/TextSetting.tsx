import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface TextSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    actionButton?: React.JSX.Element;
    validationMessage?: string;
    onFocus?: () => void;
    onBlur?: () => void;
}

export function TextSetting({
    label,
    value,
    onValueChange,
    placeholder,
    actionButton,
    validationMessage,
    onFocus,
    onBlur,
    disabled = false,
}: TextSettingProps): React.JSX.Element {
    const inputId = useId();
    const validationMessageId = validationMessage ? `${inputId}-validation` : undefined;
    const input = (
        <input
            id={inputId}
            className="native-input"
            type="text"
            placeholder={placeholder ?? ""}
            value={value}
            disabled={disabled}
            aria-invalid={validationMessage ? "true" : undefined}
            aria-describedby={validationMessageId}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            onFocus={onFocus}
            onBlur={onBlur}
        />
    );

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <div className="text-field">
                {actionButton ? (
                    <div className="text-field-with-action">
                        {input}
                        {actionButton}
                    </div>
                ) : input}
                {validationMessage && (
                    <div id={validationMessageId} className="input-validation-message">
                        {validationMessage}
                    </div>
                )}
            </div>
        </InspectorItem>
    );
}

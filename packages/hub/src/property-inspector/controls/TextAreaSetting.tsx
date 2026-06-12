import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface TextAreaSettingProps extends SettingControlProps {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
    actionButton?: React.JSX.Element;
    hint?: string;
    validationMessage?: string;
    readOnly?: boolean;
}

export function TextAreaSetting({
    label,
    value,
    onValueChange,
    rows = 4,
    placeholder,
    actionButton,
    hint,
    validationMessage,
    readOnly = false,
    disabled = false,
}: TextAreaSettingProps): React.JSX.Element {
    const inputId = useId();
    const validationMessageId = validationMessage ? `${inputId}-validation` : undefined;
    const input = (
        <textarea
            id={inputId}
            className="native-input native-textarea"
            placeholder={placeholder ?? ""}
            value={value}
            rows={rows}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={validationMessage ? "true" : undefined}
            aria-describedby={validationMessageId}
            onChange={(event) => onValueChange(event.currentTarget.value)}
        />
    );

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <div className="text-field">
                {actionButton ? (
                    <div className="text-field-with-action text-field-with-block-action">
                        {input}
                        {actionButton}
                    </div>
                ) : input}
                {validationMessage && (
                    <div id={validationMessageId} className="input-validation-message">
                        {validationMessage}
                    </div>
                )}
                {hint && <p className="section-note">{hint}</p>}
            </div>
        </InspectorItem>
    );
}

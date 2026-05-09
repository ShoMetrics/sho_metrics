import { InspectorItem } from "../components/InspectorItem";
import { resolveSettingTargetName } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import type { ScalarSettingControlProps } from "./setting-control";

interface TextSettingProps extends ScalarSettingControlProps {
    label: string;
    placeholder?: string;
    actionButton?: React.JSX.Element;
}

export function TextSetting({
    target,
    label,
    placeholder,
    actionButton,
    context,
    onSettingChange,
    disabled = false,
}: TextSettingProps): React.JSX.Element {
    const input = (
        <input
            className="native-input"
            type="text"
            data-setting-target={resolveSettingTargetName(target)}
            placeholder={placeholder ?? ""}
            value={String(readInspectorControlValue(context, target) ?? "")}
            disabled={disabled}
            onChange={(event) => onSettingChange(target, event.currentTarget.value)}
        />
    );

    return (
        <InspectorItem label={label}>
            {actionButton ? (
                <div className="text-field-with-action">
                    {input}
                    {actionButton}
                </div>
            ) : input}
        </InspectorItem>
    );
}

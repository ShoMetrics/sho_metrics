import { InspectorItem } from "../components/InspectorItem";
import { resolveSettingTargetName } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import type { ScalarSettingControlProps } from "./setting-control";

interface NumberSettingProps extends ScalarSettingControlProps {
    label: string;
    minimum?: number;
    step?: number;
}

export function NumberSetting({
    target,
    label,
    minimum,
    step,
    context,
    onSettingChange,
    disabled = false,
}: NumberSettingProps): React.JSX.Element {
    return (
        <InspectorItem label={label}>
            <input
                className="native-input"
                type="number"
                data-setting-target={resolveSettingTargetName(target)}
                min={minimum}
                step={step}
                value={String(readInspectorControlValue(context, target) ?? "")}
                disabled={disabled}
                onChange={(event) => onSettingChange(target, event.currentTarget.value)}
            />
        </InspectorItem>
    );
}

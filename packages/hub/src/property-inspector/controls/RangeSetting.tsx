import { InspectorItem } from "../components/InspectorItem";
import { resolveSettingTargetName } from "../schema";
import { readInspectorControlValue } from "../widget-setting-bindings";
import type { ScalarSettingControlProps } from "./setting-control";

interface RangeSettingProps extends ScalarSettingControlProps {
    label: string;
    minimum?: number;
    maximum?: number;
    step?: number;
}

export function RangeSetting({
    target,
    label,
    minimum = 0,
    maximum = 100,
    step = 1,
    context,
    onSettingChange,
    disabled = false,
}: RangeSettingProps): React.JSX.Element {
    const value = String(readInspectorControlValue(context, target) ?? minimum);

    return (
        <InspectorItem label={label}>
            <div className="range-control">
                <input
                    type="range"
                    data-setting-target={resolveSettingTargetName(target)}
                    min={minimum}
                    max={maximum}
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onSettingChange(target, event.currentTarget.value)}
                />
                <span className="range-value">{value}%</span>
            </div>
        </InspectorItem>
    );
}

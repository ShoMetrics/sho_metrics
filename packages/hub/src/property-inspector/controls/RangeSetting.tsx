import { useId } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

interface RangeSettingProps extends SettingControlProps {
    label: string;
    value: number;
    onValueChange: (value: number) => void;
    minimum?: number;
    maximum?: number;
    step?: number;
}

export function RangeSetting({
    label,
    value,
    onValueChange,
    minimum = 0,
    maximum = 100,
    step = 1,
    disabled = false,
}: RangeSettingProps): React.JSX.Element {
    const inputId = useId();
    const displayValue = String(value);

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <div className="range-control">
                <input
                    id={inputId}
                    type="range"
                    min={minimum}
                    max={maximum}
                    step={step}
                    value={displayValue}
                    disabled={disabled}
                    onChange={(event) => {
                        const numericValue = Number(event.currentTarget.value);
                        if (Number.isFinite(numericValue)) {
                            onValueChange(numericValue);
                        }
                    }}
                />
                <span className="range-value">{displayValue}%</span>
            </div>
        </InspectorItem>
    );
}

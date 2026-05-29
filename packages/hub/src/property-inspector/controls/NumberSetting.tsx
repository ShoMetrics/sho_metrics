import { useEffect, useId, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SettingControlProps } from "./setting-control";

type NumberSettingProps = SettingControlProps & {
    label: string;
    minimum?: number;
    maximum?: number;
    step?: number;
} & (
    | {
        value: number;
        onValueChange: (value: number) => void;
        optional?: false;
    }
    | {
        value: number | undefined;
        onValueChange: (value: number | undefined) => void;
        optional: true;
    }
);

export function NumberSetting(props: NumberSettingProps): React.JSX.Element {
    const inputId = useId();
    const [draftValue, setDraftValue] = useState(formatNumberInputValue(props.value));

    useEffect(() => {
        setDraftValue(formatNumberInputValue(props.value));
    }, [props.value]);

    function handleChange(rawValue: string): void {
        setDraftValue(rawValue);

        if (rawValue === "") {
            if (props.optional) {
                props.onValueChange(undefined);
            }
            return;
        }

        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue)) {
            props.onValueChange(numericValue);
        }
    }

    return (
        <InspectorItem label={props.label} labelFor={inputId}>
            <input
                id={inputId}
                className="native-input"
                type="number"
                min={props.minimum}
                max={props.maximum}
                step={props.step}
                value={draftValue}
                disabled={props.disabled === true}
                onChange={(event) => handleChange(event.currentTarget.value)}
                onBlur={() => setDraftValue(formatNumberInputValue(props.value))}
            />
        </InspectorItem>
    );
}

function formatNumberInputValue(value: number | undefined): string {
    return value === undefined ? "" : String(value);
}

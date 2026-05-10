import { buildCircleStylePreviewUri } from "../previews/circle-style-preview";
import type { CircleStyle } from "../inspector/action-kind";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const circleStyleOptionList = [
    { value: "value", label: "Value" },
    { value: "compact", label: "Compact" },
    { value: "gauge", label: "Gauge" },
] as const;

interface CircleStyleSettingProps extends SettingControlProps {
    value: CircleStyle;
    onValueChange: (value: CircleStyle) => void;
}

export function CircleStyleSetting(props: CircleStyleSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="Circle Style"
            optionList={circleStyleOptionList}
            buildPreviewUri={buildCircleStylePreviewUri}
        />
    );
}

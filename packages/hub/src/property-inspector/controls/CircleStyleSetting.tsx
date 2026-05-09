import { buildCircleStylePreviewUri } from "../circle-style-preview";
import type { CircleStyle } from "../settings";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const circleStyleOptionList = [
    { value: "value", label: "Value" },
    { value: "compact", label: "Compact" },
    { value: "gauge", label: "Gauge" },
] as const;

export function CircleStyleSetting(props: SettingControlProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            target="circleStyle"
            label="Circle Style"
            optionList={circleStyleOptionList}
            buildPreviewUri={(value) => buildCircleStylePreviewUri(value as CircleStyle)}
        />
    );
}

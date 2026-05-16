import type { CircleStyle } from "../inspector/settings-types";
import { buildCircleStylePreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const circleStyleOptionList = [
    { value: "value", label: "Value" },
    { value: "compact", label: "Compact" },
    { value: "gauge", label: "Gauge" },
] as const;

interface CircleStyleSettingProps extends SettingControlProps {
    value: CircleStyle;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: CircleStyle) => void;
}

export function CircleStyleSetting(props: CircleStyleSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="Layout Variant"
            optionList={circleStyleOptionList}
            buildPreviewUri={(circleStyle) => buildCircleStylePreviewUri(circleStyle, props.preview)}
        />
    );
}

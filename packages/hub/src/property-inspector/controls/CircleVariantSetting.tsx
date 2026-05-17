import type { CircleViewVariant } from "../inspector/settings-types";
import { buildCircleVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const circleVariantOptionList = [
    { value: "full-ring", label: "Full Ring" },
    { value: "minimal", label: "Minimal" },
    { value: "gauge", label: "Gauge" },
] as const;

interface CircleVariantSettingProps extends SettingControlProps {
    value: CircleViewVariant;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: CircleViewVariant) => void;
}

export function CircleVariantSetting(props: CircleVariantSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="View Variant"
            optionList={circleVariantOptionList}
            buildPreviewUri={(circleVariant) => buildCircleVariantPreviewUri(circleVariant, props.preview)}
        />
    );
}

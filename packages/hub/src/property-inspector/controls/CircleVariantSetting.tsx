import type { CircleViewVariant } from "../inspector/settings-types";
import { buildCircleVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { SelectSetting } from "./SelectSetting";
import type { SettingControlProps } from "./setting-control";

const circleVariantOptionList = [
    { value: "full-ring", label: "Full Ring" },
    { value: "minimal", label: "Minimal" },
    { value: "gauge", label: "Gauge" },
] as const;

const VARIANT_PREVIEW_SIZE_PIXELS = 32;

interface CircleVariantSettingProps extends SettingControlProps {
    value: CircleViewVariant;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: CircleViewVariant) => void;
}

export function CircleVariantSetting(props: CircleVariantSettingProps): React.JSX.Element {
    return (
        <SelectSetting
            {...props}
            label="View Variant"
            optionList={circleVariantOptionList}
            buildOptionPreviewUri={(circleVariant) => buildCircleVariantPreviewUri(circleVariant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}

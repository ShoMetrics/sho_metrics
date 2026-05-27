import type { TextViewVariant } from "../inspector/settings-types";
import { buildTextVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { SelectSetting } from "./SelectSetting";
import type { SettingControlProps } from "./setting-control";

const textVariantOptionList = [
    { value: "centered", label: "Centered" },
    { value: "title-card", label: "Title Card" },
] as const;

const VARIANT_PREVIEW_SIZE_PIXELS = 32;

interface TextVariantSettingProps extends SettingControlProps {
    value: TextViewVariant;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: TextViewVariant) => void;
}

export function TextVariantSetting(props: TextVariantSettingProps): React.JSX.Element {
    return (
        <SelectSetting
            {...props}
            label="View Variant"
            optionList={textVariantOptionList}
            buildOptionPreviewUri={(textVariant) => buildTextVariantPreviewUri(textVariant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}

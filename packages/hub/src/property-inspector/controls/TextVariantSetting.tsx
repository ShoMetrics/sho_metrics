import type { TextViewVariant } from "../inspector/settings-types";
import { buildTextVariantPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const textVariantOptionList = [
    { value: "centered", label: "Centered" },
    { value: "title-card", label: "Title Card" },
] as const;

interface TextVariantSettingProps extends SettingControlProps {
    value: TextViewVariant;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: TextViewVariant) => void;
}

export function TextVariantSetting(props: TextVariantSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="View Variant"
            optionList={textVariantOptionList}
            buildPreviewUri={(textVariant) => buildTextVariantPreviewUri(textVariant, props.preview)}
        />
    );
}

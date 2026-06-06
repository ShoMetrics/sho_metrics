import type { TextViewVariant } from "../inspector/settings-types";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
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
    const { t } = useI18n();

    return (
        <SelectSetting
            {...props}
            label={t(commonMessages.viewVariantLabel)}
            optionList={localizeOptionList(t, textVariantOptionList, textVariantMessageByValue)}
            buildOptionPreviewUri={(textVariant) => buildTextVariantPreviewUri(textVariant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}

const textVariantMessageByValue = {
    centered: optionMessages.centeredOption,
    "title-card": optionMessages.titleCardOption,
} as const;

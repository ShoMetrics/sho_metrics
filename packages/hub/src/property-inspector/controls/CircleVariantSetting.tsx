import type { CircleViewVariant } from "../inspector/settings-types";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
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
    const { t } = useI18n();

    return (
        <SelectSetting
            {...props}
            label={t(commonMessages.viewVariantLabel)}
            optionList={localizeOptionList(t, circleVariantOptionList, circleVariantMessageByValue)}
            buildOptionPreviewUri={(circleVariant) => buildCircleVariantPreviewUri(circleVariant, props.preview)}
            optionPreviewSizePixels={VARIANT_PREVIEW_SIZE_PIXELS}
        />
    );
}

const circleVariantMessageByValue = {
    "full-ring": optionMessages.fullRingOption,
    minimal: optionMessages.minimalOption,
    gauge: optionMessages.gaugeOption,
} as const;

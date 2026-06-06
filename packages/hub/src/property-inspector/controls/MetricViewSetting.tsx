import type { MetricView } from "../inspector/settings-types";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import { buildMetricViewPreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const metricViewOptionList = [
    { value: "circle", label: "Circle" },
    { value: "text", label: "Text" },
    { value: "bar", label: "Bar" },
    { value: "line", label: "Line" },
] as const;

interface MetricViewSettingProps extends SettingControlProps {
    value: MetricView;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: MetricView) => void;
}

export function MetricViewSetting(props: MetricViewSettingProps): React.JSX.Element {
    const { t } = useI18n();

    return (
        <PreviewOptionSetting
            {...props}
            label={t(commonMessages.viewLabel)}
            optionList={localizeOptionList(t, metricViewOptionList, metricViewMessageByValue)}
            buildPreviewUri={(metricView) => buildMetricViewPreviewUri(metricView, props.preview)}
        />
    );
}

const metricViewMessageByValue = {
    circle: optionMessages.circleOption,
    text: optionMessages.textOption,
    bar: optionMessages.barOption,
    line: optionMessages.lineOption,
} as const;

import type { MetricView } from "../inspector/settings-types";
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
    return (
        <PreviewOptionSetting
            {...props}
            label="View"
            optionList={metricViewOptionList}
            buildPreviewUri={(metricView) => buildMetricViewPreviewUri(metricView, props.preview)}
        />
    );
}

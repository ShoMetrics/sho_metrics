import type { SingleMetricViewLayout } from "../inspector/settings-types";
import { buildGraphicTypePreviewUri, type MetricPreviewInput } from "../previews/metric-option-preview";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const graphicTypeOptionList = [
    { value: "circular", label: "Circle" },
    { value: "text", label: "Text" },
    { value: "linear", label: "Bar" },
    { value: "sparkline", label: "Trend" },
] as const;

interface GraphicTypeSettingProps extends SettingControlProps {
    value: SingleMetricViewLayout;
    preview?: MetricPreviewInput | undefined;
    onValueChange: (value: SingleMetricViewLayout) => void;
}

export function GraphicTypeSetting(props: GraphicTypeSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="Layout"
            optionList={graphicTypeOptionList}
            buildPreviewUri={(graphicType) => buildGraphicTypePreviewUri(graphicType, props.preview)}
        />
    );
}

import { buildGraphicTypePreviewUri } from "../previews/graphic-type-preview";
import type { SingleMetricViewLayout } from "../inspector/settings-types";
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
    onValueChange: (value: SingleMetricViewLayout) => void;
}

export function GraphicTypeSetting(props: GraphicTypeSettingProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            label="Layout"
            optionList={graphicTypeOptionList}
            buildPreviewUri={buildGraphicTypePreviewUri}
        />
    );
}

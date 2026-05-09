import { buildGraphicTypePreviewUri } from "../graphic-type-preview";
import type { GraphicType } from "../settings";
import { PreviewOptionSetting } from "./PreviewOptionSetting";
import type { SettingControlProps } from "./setting-control";

const graphicTypeOptionList = [
    { value: "circular", label: "Circle" },
    { value: "text", label: "Text" },
    { value: "linear", label: "Bar" },
    { value: "dashed-line", label: "Trend" },
] as const;

interface GraphicTypeSettingProps extends SettingControlProps {
    value: GraphicType;
    onValueChange: (value: GraphicType) => void;
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

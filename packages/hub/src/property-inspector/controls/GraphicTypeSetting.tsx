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

export function GraphicTypeSetting(props: SettingControlProps): React.JSX.Element {
    return (
        <PreviewOptionSetting
            {...props}
            target="graphicType"
            label="Layout"
            optionList={graphicTypeOptionList}
            buildPreviewUri={(value) => buildGraphicTypePreviewUri(value as GraphicType)}
        />
    );
}

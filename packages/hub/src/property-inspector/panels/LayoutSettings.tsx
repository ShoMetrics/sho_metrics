import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { graphicStyleOptionList } from "./setting-options";

export function LayoutSettings({
    context,
    onSettingChange,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Layout">
            <GraphicTypeSetting
                value={context.resolved.appearance.graphicType}
                onValueChange={(value) => onSettingChange("graphicType", value)}
                disabled={appearanceDisabled}
            />
            <SelectSetting
                label="Graphic Style"
                value={context.resolved.appearance.graphicStyle}
                optionList={graphicStyleOptionList}
                onValueChange={(value) => onSettingChange("graphicStyle", value)}
                disabled={appearanceDisabled}
            />
            {context.resolved.appearance.graphicType === "circular" && (
                <CircleStyleSetting
                    value={context.resolved.appearance.circleStyle}
                    onValueChange={(value) => onSettingChange("circleStyle", value)}
                    disabled={appearanceDisabled}
                />
            )}
        </SettingsSection>
    );
}

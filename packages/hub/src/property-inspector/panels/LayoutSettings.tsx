import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { graphicStyleOptionList } from "./setting-options";

export function LayoutSettings({
    context,
    onSettingsPatch,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = context.resolved.widget.slot.appearance;

    return (
        <SettingsSection title="Layout">
            <GraphicTypeSetting
                value={appearance.viewLayout}
                onValueChange={(viewLayout) => onSettingsPatch({
                    appearance: { viewLayout },
                })}
                disabled={appearanceDisabled}
            />
            <SelectSetting
                label="Graphic Style"
                value={appearance.theme}
                optionList={graphicStyleOptionList}
                onValueChange={(theme) => onSettingsPatch({
                    appearance: { theme },
                })}
                disabled={appearanceDisabled}
            />
            {appearance.viewLayout === "circular" && (
                <CircleStyleSetting
                    value={appearance.circleStyle}
                    onValueChange={(circleStyle) => onSettingsPatch({
                        appearance: { circleStyle },
                    })}
                    disabled={appearanceDisabled}
                />
            )}
        </SettingsSection>
    );
}

import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { graphicStyleOptionList } from "./setting-options";

export function LayoutSettings({
    context,
    onSettingsPatch,
    graphDisabled = false,
    themeDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = context.resolved.widget.slot.appearance;

    return (
        <SettingsSection title="Layout">
            <GraphicTypeSetting
                value={appearance.graph.viewLayout}
                onValueChange={(viewLayout) => onSettingsPatch({
                    appearance: { graph: { viewLayout } },
                })}
                disabled={graphDisabled}
            />
            <SelectSetting
                label="Graphic Style"
                value={appearance.theme.selectedTheme}
                optionList={graphicStyleOptionList}
                onValueChange={(selectedTheme) => onSettingsPatch({
                    appearance: { theme: { selectedTheme } },
                })}
                disabled={themeDisabled}
            />
            {appearance.graph.viewLayout === "circular" && (
                <CircleStyleSetting
                    value={appearance.graph.circleStyle}
                    onValueChange={(circleStyle) => onSettingsPatch({
                        appearance: { graph: { circleStyle } },
                    })}
                    disabled={graphDisabled}
                />
            )}
        </SettingsSection>
    );
}

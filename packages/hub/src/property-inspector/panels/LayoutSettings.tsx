import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { TerminalVariantSetting } from "../controls/TerminalVariantSetting";
import { ThemeSetting } from "../controls/ThemeSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";

export function LayoutSettings({
    context,
    onSettingsPatch,
    graphDisabled = false,
    themeDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = context.resolved.widget.slot.appearance;
    const preview = {
        appearance,
        target: context.resolved.widget.slot.metric.target,
    };

    return (
        <SettingsSection title="Layout">
            <GraphicTypeSetting
                value={appearance.graph.viewLayout}
                preview={preview}
                onValueChange={(viewLayout) => onSettingsPatch({
                    appearance: { graph: { viewLayout } },
                })}
                disabled={graphDisabled}
            />
            {appearance.graph.viewLayout === "circular" && (
                <CircleStyleSetting
                    value={appearance.graph.circleStyle}
                    preview={preview}
                    onValueChange={(circleStyle) => onSettingsPatch({
                        appearance: { graph: { circleStyle } },
                    })}
                    disabled={graphDisabled}
                />
            )}
            <ThemeSetting
                value={appearance.theme.selectedTheme}
                preview={preview}
                onValueChange={(selectedTheme) => onSettingsPatch({
                    appearance: { theme: { selectedTheme } },
                })}
                disabled={themeDisabled}
            />
            {appearance.theme.selectedTheme === "terminal" && (
                <TerminalVariantSetting
                    value={appearance.theme.terminal.variant}
                    preview={preview}
                    onValueChange={(variant) => onSettingsPatch({
                        appearance: { theme: { terminal: { variant } } },
                    })}
                    disabled={themeDisabled}
                />
            )}
        </SettingsSection>
    );
}

import { CircleVariantSetting } from "../controls/CircleVariantSetting";
import { MetricViewSetting } from "../controls/MetricViewSetting";
import { TerminalVariantSetting } from "../controls/TerminalVariantSetting";
import { ThemeSetting } from "../controls/ThemeSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";

export function AppearanceSettings({
    context,
    onSettingsPatch,
    viewDisabled = false,
    themeDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = context.resolved.widget.slot.appearance;
    const preview = {
        appearance,
        target: context.resolved.widget.slot.metric.target,
    };

    return (
        <SettingsSection title="Appearance">
            <MetricViewSetting
                value={appearance.view.selectedView}
                preview={preview}
                onValueChange={(selectedView) => onSettingsPatch({
                    appearance: { view: { selectedView } },
                })}
                disabled={viewDisabled}
            />
            {appearance.view.selectedView === "circle" && (
                <CircleVariantSetting
                    value={appearance.view.circleVariant}
                    preview={preview}
                    onValueChange={(circleVariant) => onSettingsPatch({
                        appearance: { view: { circleVariant } },
                    })}
                    disabled={viewDisabled}
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

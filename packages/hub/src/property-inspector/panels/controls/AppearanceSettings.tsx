import { CircleVariantSetting } from "../../controls/CircleVariantSetting";
import { MetricViewSetting } from "../../controls/MetricViewSetting";
import { TerminalVariantSetting } from "../../controls/TerminalVariantSetting";
import { TextVariantSetting } from "../../controls/TextVariantSetting";
import { ThemeSetting } from "../../controls/ThemeSetting";
import { TransparentSurfaceSetting } from "../../controls/TransparentSurfaceSetting";
import { SettingsSection } from "./SettingsSection";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { useI18n } from "../../../i18n/react";
import { buildTransparentSurfaceAppearanceOverride } from "../../../settings/appearance-overrides";
import { requireResolvedSingleMetricWidget } from "../../../settings/resolved-settings";
import type { WidgetSettingsPanelProps } from "../panel-props";

export function AppearanceSettings({
    context,
    onSettingsPatch,
    viewDisabled = false,
    themeDisabled = false,
    transparentSurfaceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const { t } = useI18n();
    const slot = requireResolvedSingleMetricWidget(context.resolved).slot;
    const appearance = slot.appearance;
    const preview = {
        appearance,
        target: slot.metric.target,
    };

    return (
        <>
            <SettingsSection title={t(commonMessages.appearanceViewSection)}>
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
                {appearance.view.selectedView === "text" && (
                    <TextVariantSetting
                        value={appearance.view.textVariant}
                        preview={preview}
                        onValueChange={(textVariant) => onSettingsPatch({
                            appearance: { view: { textVariant } },
                        })}
                        disabled={viewDisabled}
                    />
                )}
            </SettingsSection>
            <SettingsSection title={t(commonMessages.appearanceThemeSection)}>
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
                <TransparentSurfaceSetting
                    value={appearance.transparentSurface}
                    onPatch={(transparentSurface) => onSettingsPatch({
                        appearance: buildTransparentSurfaceAppearanceOverride(transparentSurface),
                    })}
                    disabled={transparentSurfaceDisabled}
                />
            </SettingsSection>
        </>
    );
}

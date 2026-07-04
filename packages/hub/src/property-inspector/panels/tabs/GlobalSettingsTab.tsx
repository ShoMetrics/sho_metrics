import { CircleVariantSetting } from "../../controls/CircleVariantSetting";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { globalSettingsMessages } from "../../../i18n/message-groups/settings";
import { useI18n } from "../../../i18n/react";
import { MetricViewSetting } from "../../controls/MetricViewSetting";
import { TerminalVariantSetting } from "../../controls/TerminalVariantSetting";
import { TextVariantSetting } from "../../controls/TextVariantSetting";
import { ThemeSetting } from "../../controls/ThemeSetting";
import { TransparentSurfaceRangeControls } from "../../controls/TransparentSurfaceSetting";
import { InspectorItem } from "../../components/InspectorItem";
import {
    ColorFilledPaintControls,
    MetricColorControls,
    TerminalPaintControls,
} from "../controls/ColorSettings";
import { buildDefaultAppearanceSettings } from "../../../settings/default-appearance-settings";
import { SettingsSection } from "../controls/SettingsSection";
import type {
    MetricTheme,
    ResolvedGlobalPaintOverride,
    ResolvedGlobalSettings,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalTransparentSurfaceOverride,
    ResolvedGlobalViewOverride,
    ResolvedMetricTarget,
} from "../../../settings/resolved-settings";
import type { StoredGlobalSettingsPatch } from "../../../settings/storage/global-settings-patch";
import type { ColorCompensationProfile } from "../../../color-compensation/types";
import { ColorCompensationControls } from "../controls/ColorCompensationControls";
import type { MetricPreviewInput } from "../../previews/metric-option-preview";

interface GlobalSettingsTabProps {
    resolvedSettings: ResolvedGlobalSettings;
    colorCompensationProfile: ColorCompensationProfile;
    onSettingsPatch: (patch: StoredGlobalSettingsPatch) => void;
    onOpenColorCompensation: () => void;
}
const GLOBAL_OVERRIDE_PREVIEW_TARGET = {
    domain: "cpu",
    reading: { kind: "usage" },
} satisfies ResolvedMetricTarget;

export function GlobalSettingsTab({
    resolvedSettings,
    colorCompensationProfile,
    onSettingsPatch,
    onOpenColorCompensation,
}: GlobalSettingsTabProps): React.JSX.Element {
    const { t } = useI18n();

    return (
        <div>
            <GlobalOverrideSection
                isGlobalOverrideEnabled={resolvedSettings.globalOverrideEnabled}
                onOverrideChange={(globalOverrideEnabled) => onSettingsPatch({ globalOverrideEnabled })}
            />
            {resolvedSettings.globalOverrideEnabled && (
                <>
                    <ViewOverrideSection
                        viewOverride={resolvedSettings.viewOverride}
                        themeOverride={resolvedSettings.themeOverride}
                        onOverrideChange={(viewOverrideEnabled) => onSettingsPatch({
                            viewOverrideEnabled,
                        })}
                        onViewPatch={(view) => onSettingsPatch({ view })}
                    />
                    <ThemeOverrideSection
                        viewOverride={resolvedSettings.viewOverride}
                        themeOverride={resolvedSettings.themeOverride}
                        onOverrideChange={(themeOverrideEnabled) => onSettingsPatch({
                            themeOverrideEnabled,
                        })}
                        onThemePatch={(theme) => onSettingsPatch({ theme })}
                    />
                    <PaintOverrideSection
                        selectedTheme={resolvedSettings.themeOverride?.theme.selectedTheme}
                        paintOverride={resolvedSettings.paintOverride}
                        onOverrideChange={(paintOverrideEnabled) => onSettingsPatch({
                            paintOverrideEnabled,
                        })}
                        onPaintPatch={(paint) => onSettingsPatch({ paint })}
                    />
                    <TransparentSurfaceOverrideSection
                        transparentSurfaceOverride={resolvedSettings.transparentSurfaceOverride}
                        onOverrideChange={(transparentSurfaceOverrideEnabled) => onSettingsPatch({
                            // The global override gate and the transparent-surface feature flag must move together.
                            // Otherwise the override section can exist while the surface renderer still treats it as disabled.
                            transparentSurfaceOverrideEnabled,
                            transparentSurface: { enabled: transparentSurfaceOverrideEnabled },
                        })}
                        onTransparentSurfacePatch={(transparentSurface) => onSettingsPatch({ transparentSurface })}
                    />
                </>
            )}
            <SettingsSection title={t(commonMessages.advancedSection)}>
                <ColorCompensationControls
                    profile={colorCompensationProfile}
                    onOpenColorCompensation={onOpenColorCompensation}
                />
            </SettingsSection>
        </div>
    );
}
function GlobalOverrideSection({
    isGlobalOverrideEnabled,
    onOverrideChange,
}: {
    isGlobalOverrideEnabled: boolean;
    onOverrideChange: (isGlobalOverrideEnabled: boolean) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(globalSettingsMessages.overrideSection)}>
            <InspectorItem label={t(globalSettingsMessages.widgetsLabel)}>
                <div className="override-toggle-control">
                    <label className="native-checkbox-row">
                        <input
                            type="checkbox"
                            checked={isGlobalOverrideEnabled}
                            onChange={(event) => onOverrideChange(event.currentTarget.checked)}
                        />
                        <span>{t(globalSettingsMessages.globalOverrideLabel)}</span>
                    </label>
                    <p className="section-note">
                        {t(globalSettingsMessages.globalOverrideNote)}
                    </p>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

function ViewOverrideSection({
    viewOverride,
    themeOverride,
    onOverrideChange,
    onViewPatch,
}: {
    viewOverride: ResolvedGlobalViewOverride | undefined;
    themeOverride: ResolvedGlobalThemeOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onViewPatch: (patch: NonNullable<StoredGlobalSettingsPatch["view"]>) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const preview = buildGlobalOverridePreview(viewOverride, themeOverride);

    return (
        <SettingsSection title={t(globalSettingsMessages.viewOverrideSection)}>
            <OverrideSubsectionToggle
                label={t(globalSettingsMessages.overrideViewLabel)}
                isEnabled={viewOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {viewOverride && (
                <>
                    <MetricViewSetting
                        value={viewOverride.view.selectedView}
                        preview={preview}
                        onValueChange={(selectedView) => onViewPatch({ selectedView })}
                    />
                    {viewOverride.view.selectedView === "circle" && (
                        <CircleVariantSetting
                            value={viewOverride.view.circleVariant}
                            preview={preview}
                            onValueChange={(circleVariant) => onViewPatch({ circleVariant })}
                        />
                    )}
                    {viewOverride.view.selectedView === "text" && (
                        <TextVariantSetting
                            value={viewOverride.view.textVariant}
                            preview={preview}
                            onValueChange={(textVariant) => onViewPatch({ textVariant })}
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
}

function ThemeOverrideSection({
    viewOverride,
    themeOverride,
    onOverrideChange,
    onThemePatch,
}: {
    viewOverride: ResolvedGlobalViewOverride | undefined;
    themeOverride: ResolvedGlobalThemeOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onThemePatch: (patch: NonNullable<StoredGlobalSettingsPatch["theme"]>) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const preview = buildGlobalOverridePreview(viewOverride, themeOverride);

    return (
        <SettingsSection title={t(globalSettingsMessages.themeOverrideSection)}>
            <OverrideSubsectionToggle
                label={t(globalSettingsMessages.overrideThemeLabel)}
                isEnabled={themeOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {themeOverride && (
                <>
                    <ThemeSetting
                        value={themeOverride.theme.selectedTheme}
                        preview={preview}
                        onValueChange={(selectedTheme) => onThemePatch({ selectedTheme })}
                    />
                    {themeOverride.theme.selectedTheme === "terminal" && (
                        <TerminalVariantSetting
                            value={themeOverride.theme.terminal.variant}
                            preview={preview}
                            onValueChange={(variant) => onThemePatch({ terminal: { variant } })}
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
}

function buildGlobalOverridePreview(
    viewOverride: ResolvedGlobalViewOverride | undefined,
    themeOverride: ResolvedGlobalThemeOverride | undefined,
): MetricPreviewInput {
    return {
        appearance: buildDefaultAppearanceSettings({
            view: viewOverride?.view,
            theme: themeOverride?.theme,
        }),
        target: GLOBAL_OVERRIDE_PREVIEW_TARGET,
    };
}

function PaintOverrideSection({
    selectedTheme,
    paintOverride,
    onOverrideChange,
    onPaintPatch,
}: {
    selectedTheme: MetricTheme | undefined;
    paintOverride: ResolvedGlobalPaintOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onPaintPatch: (patch: NonNullable<StoredGlobalSettingsPatch["paint"]>) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(globalSettingsMessages.colorOverrideSection)}>
            <OverrideSubsectionToggle
                label={t(globalSettingsMessages.overrideColorLabel)}
                isEnabled={paintOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {paintOverride ? (
                <ActivePaintOverrideControls
                    selectedTheme={selectedTheme}
                    paintOverride={paintOverride}
                    onPaintPatch={onPaintPatch}
                />
            ) : null}
        </SettingsSection>
    );
}

function TransparentSurfaceOverrideSection({
    transparentSurfaceOverride,
    onOverrideChange,
    onTransparentSurfacePatch,
}: {
    transparentSurfaceOverride: ResolvedGlobalTransparentSurfaceOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onTransparentSurfacePatch: (patch: NonNullable<StoredGlobalSettingsPatch["transparentSurface"]>) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(globalSettingsMessages.transparentSurfaceOverrideSection)}>
            <OverrideSubsectionToggle
                label={t(globalSettingsMessages.overrideTransparentSurfaceLabel)}
                isEnabled={transparentSurfaceOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {transparentSurfaceOverride ? (
                <TransparentSurfaceRangeControls
                    value={transparentSurfaceOverride.transparentSurface}
                    onPatch={onTransparentSurfacePatch}
                />
            ) : null}
        </SettingsSection>
    );
}

function ActivePaintOverrideControls({
    selectedTheme,
    paintOverride,
    onPaintPatch,
}: {
    selectedTheme: MetricTheme | undefined;
    paintOverride: ResolvedGlobalPaintOverride;
    onPaintPatch: (patch: NonNullable<StoredGlobalSettingsPatch["paint"]>) => void;
}): React.JSX.Element {
    if (selectedTheme === "color-filled") {
        return (
            <ColorFilledPaintControls
                colorFilled={paintOverride.colorFilled}
                onColorModeChange={(colorMode) => onPaintPatch({ colorFilled: { colorMode } })}
                onSolidPatch={(solid) => onPaintPatch({ colorFilled: { solid } })}
                onMultiColorPatch={(multiColor) => onPaintPatch({ colorFilled: { multiColor } })}
            />
        );
    }

    if (selectedTheme === "terminal") {
        return (
            <TerminalPaintControls
                terminalPaint={paintOverride.terminal}
                onPaintPatch={(terminal) => onPaintPatch({ terminal })}
            />
        );
    }

    if (selectedTheme === "pixel-window") {
        return <></>;
    }

    return (
        <MetricColorControls
            colorMode={paintOverride.metric.colorMode}
            solidColor={paintOverride.metric.solid.color}
            multiColor={paintOverride.metric.multiColor.colors}
            lowThresholdPercent={paintOverride.metric.multiColor.lowThresholdPercent}
            highThresholdPercent={paintOverride.metric.multiColor.highThresholdPercent}
            isSolidGradientEnabled={paintOverride.metric.solid.isGradientEnabled}
            isMultiColorGradientEnabled={paintOverride.metric.multiColor.isGradientEnabled}
            onColorModeChange={(colorMode) => onPaintPatch({ metric: { colorMode } })}
            onSolidColorChange={(color) => onPaintPatch({ metric: { solid: { color } } })}
            onMultiColorPatch={(colors) => onPaintPatch({ metric: { multiColor: { colors } } })}
            onThresholdPatch={(thresholdPatch) => onPaintPatch({ metric: { multiColor: thresholdPatch } })}
            onSolidGradientChange={(isGradientEnabled) => onPaintPatch({
                metric: { solid: { isGradientEnabled } },
            })}
            onMultiColorGradientChange={(isGradientEnabled) => onPaintPatch({
                metric: { multiColor: { isGradientEnabled } },
            })}
        />
    );
}

function OverrideSubsectionToggle({
    label,
    isEnabled,
    onValueChange,
}: {
    label: string;
    isEnabled: boolean;
    onValueChange: (isEnabled: boolean) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <InspectorItem label={t(commonMessages.enabledLabel)}>
            <label className="native-checkbox-row">
                <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(event) => onValueChange(event.currentTarget.checked)}
                />
                <span>{label}</span>
            </label>
        </InspectorItem>
    );
}

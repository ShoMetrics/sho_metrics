import { CircleVariantSetting } from "../controls/CircleVariantSetting";
import { MetricViewSetting } from "../controls/MetricViewSetting";
import { NumberSetting } from "../controls/NumberSetting";
import { TerminalVariantSetting } from "../controls/TerminalVariantSetting";
import { ThemeSetting } from "../controls/ThemeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { InspectorItem } from "../components/InspectorItem";
import {
    ColorFilledPaintControls,
    MetricColorControls,
} from "./ColorSettings";
import { SettingsSection } from "./SettingsSection";
import {
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";
import type {
    MetricTheme,
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGlobalPaintOverride,
    ResolvedGlobalSettings,
    ResolvedGlobalThemeOverride,
    ResolvedGlobalViewOverride,
    ResolvedNetworkDisplaySettings,
} from "../../settings/resolved-settings";
import type { StoredGlobalSettingsPatch } from "../../settings/storage/global-settings-patch";

interface PluginSettingsTabProps {
    resolvedSettings: ResolvedGlobalSettings;
    onSettingsPatch: (patch: StoredGlobalSettingsPatch) => void;
}

export function PluginSettingsTab({ resolvedSettings, onSettingsPatch }: PluginSettingsTabProps): React.JSX.Element {
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
                        onOverrideChange={(viewOverrideEnabled) => onSettingsPatch({
                            viewOverrideEnabled,
                        })}
                        onViewPatch={(view) => onSettingsPatch({ view })}
                    />
                    <ThemeOverrideSection
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
                </>
            )}
            <NetworkDefaultsSection
                network={resolvedSettings.defaults.network}
                onNetworkPatch={(network) => onSettingsPatch({ network })}
            />
            <DiskThroughputDefaultsSection
                diskThroughput={resolvedSettings.defaults.diskThroughput}
                onDiskThroughputPatch={(diskThroughput) => onSettingsPatch({ diskThroughput })}
            />
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
    return (
        <SettingsSection title="Override">
            <InspectorItem label="Widgets">
                <div className="override-toggle-control">
                    <label className="native-checkbox-row">
                        <input
                            type="checkbox"
                            checked={isGlobalOverrideEnabled}
                            onChange={(event) => onOverrideChange(event.currentTarget.checked)}
                        />
                        <span>Global override</span>
                    </label>
                    <p className="section-note">
                        Apply selected view, theme, and color settings to every widget.
                    </p>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

function ViewOverrideSection({
    viewOverride,
    onOverrideChange,
    onViewPatch,
}: {
    viewOverride: ResolvedGlobalViewOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onViewPatch: (patch: NonNullable<StoredGlobalSettingsPatch["view"]>) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="View Override">
            <OverrideSubsectionToggle
                label="Override view"
                isEnabled={viewOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {viewOverride && (
                <>
                    <MetricViewSetting
                        value={viewOverride.view.selectedView}
                        onValueChange={(selectedView) => onViewPatch({ selectedView })}
                    />
                    <CircleVariantSetting
                        value={viewOverride.view.circleVariant}
                        onValueChange={(circleVariant) => onViewPatch({ circleVariant })}
                        disabled={viewOverride.view.selectedView !== "circle"}
                    />
                </>
            )}
        </SettingsSection>
    );
}

function ThemeOverrideSection({
    themeOverride,
    onOverrideChange,
    onThemePatch,
}: {
    themeOverride: ResolvedGlobalThemeOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onThemePatch: (patch: NonNullable<StoredGlobalSettingsPatch["theme"]>) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Theme Override">
            <OverrideSubsectionToggle
                label="Override theme"
                isEnabled={themeOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {themeOverride && (
                <>
                    <ThemeSetting
                        value={themeOverride.theme.selectedTheme}
                        onValueChange={(selectedTheme) => onThemePatch({ selectedTheme })}
                    />
                    {themeOverride.theme.selectedTheme === "terminal" && (
                        <TerminalVariantSetting
                            value={themeOverride.theme.terminal.variant}
                            onValueChange={(variant) => onThemePatch({ terminal: { variant } })}
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
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
    if (selectedTheme === "terminal") {
        return <></>;
    }

    return (
        <SettingsSection title="Color Override">
            <OverrideSubsectionToggle
                label="Override color"
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

function ActivePaintOverrideControls({
    selectedTheme,
    paintOverride,
    onPaintPatch,
}: {
    selectedTheme: MetricTheme | undefined;
    paintOverride: ResolvedGlobalPaintOverride;
    onPaintPatch: (patch: NonNullable<StoredGlobalSettingsPatch["paint"]>) => void;
}): React.JSX.Element {
    if (selectedTheme === "terminal") {
        return <></>;
    }

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
    return (
        <InspectorItem label="Enabled">
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

function NetworkDefaultsSection({
    network,
    onNetworkPatch,
}: {
    network: ResolvedNetworkDisplaySettings;
    onNetworkPatch: (patch: NonNullable<StoredGlobalSettingsPatch["network"]>) => void;
}): React.JSX.Element {
    const isAutoScale = network.scaleMode === "auto";

    return (
        <SettingsSection title="Network Defaults">
            <SelectSetting
                label="Unit"
                value={network.unitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(unitBase) => onNetworkPatch({ unitBase })}
            />
            <SelectSetting
                label="Scale"
                value={network.scaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(scaleMode) => onNetworkPatch({ scaleMode })}
            />
            <NumberSetting
                label="Download Max"
                value={network.maximumDownloadSpeedMegabitsPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(maximumDownloadSpeedMegabitsPerSecond) =>
                    onNetworkPatch({ maximumDownloadSpeedMegabitsPerSecond })}
            />
            <NumberSetting
                label="Upload Max"
                value={network.maximumUploadSpeedMegabitsPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(maximumUploadSpeedMegabitsPerSecond) =>
                    onNetworkPatch({ maximumUploadSpeedMegabitsPerSecond })}
            />
        </SettingsSection>
    );
}

function DiskThroughputDefaultsSection({
    diskThroughput,
    onDiskThroughputPatch,
}: {
    diskThroughput: ResolvedDiskThroughputDisplaySettings;
    onDiskThroughputPatch: (patch: NonNullable<StoredGlobalSettingsPatch["diskThroughput"]>) => void;
}): React.JSX.Element {
    const isAutoScale = diskThroughput.scaleMode === "auto";

    return (
        <SettingsSection title="Disk Throughput Defaults">
            <SelectSetting
                label="Scale"
                value={diskThroughput.scaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(scaleMode) => onDiskThroughputPatch({ scaleMode })}
            />
            <NumberSetting
                label="Read Max"
                value={diskThroughput.maximumReadThroughputMebibytesPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(maximumReadThroughputMebibytesPerSecond) =>
                    onDiskThroughputPatch({ maximumReadThroughputMebibytesPerSecond })}
            />
            <NumberSetting
                label="Write Max"
                value={diskThroughput.maximumWriteThroughputMebibytesPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(maximumWriteThroughputMebibytesPerSecond) =>
                    onDiskThroughputPatch({ maximumWriteThroughputMebibytesPerSecond })}
            />
        </SettingsSection>
    );
}

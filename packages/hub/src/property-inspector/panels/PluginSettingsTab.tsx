import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { ColorSetting } from "../controls/ColorSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { InspectorItem } from "../components/InspectorItem";
import { SettingsSection } from "./SettingsSection";
import {
    colorModeOptionList,
    graphicStyleOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";
import type {
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGlobalAppearanceOverride,
    ResolvedGlobalSettings,
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
            <OverrideSection
                isAppearanceOverrideEnabled={resolvedSettings.appearanceOverride !== undefined}
                onOverrideChange={(appearanceEnabled) => onSettingsPatch({ appearanceEnabled })}
            />
            {resolvedSettings.appearanceOverride && (
                <OverrideAppearanceSection
                    appearance={resolvedSettings.appearanceOverride}
                    onAppearancePatch={(appearance) => onSettingsPatch({ appearance })}
                />
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

function OverrideSection({
    isAppearanceOverrideEnabled,
    onOverrideChange,
}: {
    isAppearanceOverrideEnabled: boolean;
    onOverrideChange: (isAppearanceOverrideEnabled: boolean) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override">
            <InspectorItem className="override-toggle-item">
                <label className="override-toggle-row">
                    <input
                        type="checkbox"
                        checked={isAppearanceOverrideEnabled}
                        onChange={(event) => onOverrideChange(event.currentTarget.checked)}
                    />
                    <span className="override-toggle-title">Override Widgets</span>
                    <span className="override-toggle-note">
                        When enabled, widget appearance settings are disabled but kept.
                    </span>
                </label>
            </InspectorItem>
        </SettingsSection>
    );
}

function OverrideAppearanceSection({
    appearance,
    onAppearancePatch,
}: {
    appearance: ResolvedGlobalAppearanceOverride;
    onAppearancePatch: (patch: NonNullable<StoredGlobalSettingsPatch["appearance"]>) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override Appearance">
            <GraphicTypeSetting
                value={appearance.viewLayout}
                onValueChange={(viewLayout) => onAppearancePatch({ viewLayout })}
            />
            <CircleStyleSetting
                value={appearance.circleStyle}
                onValueChange={(circleStyle) => onAppearancePatch({ circleStyle })}
                disabled={appearance.viewLayout !== "circular"}
            />
            <SelectSetting
                label="Graphic Style"
                value={appearance.theme}
                optionList={graphicStyleOptionList}
                onValueChange={(theme) => onAppearancePatch({ theme })}
            />
            <ColorSetting
                label="Tint Color"
                value={appearance.tintColor}
                onValueChange={(tintColor) => onAppearancePatch({ tintColor })}
            />
            <SelectSetting
                label="Color Mode"
                value={appearance.colorMode}
                optionList={colorModeOptionList}
                onValueChange={(colorMode) => onAppearancePatch({ colorMode })}
            />
            {appearance.colorMode === "threshold" && (
                <>
                    <NumberSetting
                        label="Low Threshold"
                        value={appearance.lowColorThresholdPercent}
                        minimum={0}
                        step={1}
                        onValueChange={(lowColorThresholdPercent) => onAppearancePatch({ lowColorThresholdPercent })}
                    />
                    <NumberSetting
                        label="High Threshold"
                        value={appearance.highColorThresholdPercent}
                        minimum={0}
                        step={1}
                        onValueChange={(highColorThresholdPercent) => onAppearancePatch({ highColorThresholdPercent })}
                    />
                </>
            )}
        </SettingsSection>
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

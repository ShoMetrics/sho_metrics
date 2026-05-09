import { CircleStyleSetting } from "./controls/CircleStyleSetting";
import { ColorSetting } from "./controls/ColorSetting";
import { GraphicTypeSetting } from "./controls/GraphicTypeSetting";
import { NumberSetting } from "./controls/NumberSetting";
import { SelectSetting } from "./controls/SelectSetting";
import { InspectorItem } from "./components/InspectorItem";
import { SettingsSection } from "./panels/SettingsSection";
import {
    colorModeOptionList,
    graphicStyleOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./panels/setting-options";
import {
    type AppearanceSettings,
    type DiskThroughputDefaultSettings,
    type GlobalSettings,
    type NetworkDefaultSettings,
    type ResolvedGlobalSettings,
} from "../settings/widget-settings";

interface PluginSettingsTabProps {
    resolvedSettings: ResolvedGlobalSettings;
    onSettingsPatch: (patch: GlobalSettings) => void;
}

export function PluginSettingsTab({ resolvedSettings, onSettingsPatch }: PluginSettingsTabProps): React.JSX.Element {
    return (
        <div>
            <OverrideSection
                overrideWidgetAppearance={resolvedSettings.overrideWidgetAppearance}
                onOverrideChange={(overrideWidgetAppearance) => onSettingsPatch({ overrideWidgetAppearance })}
            />
            {resolvedSettings.overrideWidgetAppearance && (
                <OverrideAppearanceSection
                    appearance={resolvedSettings.appearanceDefaults}
                    onAppearancePatch={(appearanceDefaults) => onSettingsPatch({ appearanceDefaults })}
                />
            )}
            <NetworkDefaultsSection
                network={resolvedSettings.networkDefaults}
                onNetworkPatch={(networkDefaults) => onSettingsPatch({ networkDefaults })}
            />
            <DiskThroughputDefaultsSection
                diskThroughput={resolvedSettings.diskThroughputDefaults}
                onDiskThroughputPatch={(diskThroughputDefaults) => onSettingsPatch({ diskThroughputDefaults })}
            />
        </div>
    );
}

function OverrideSection({
    overrideWidgetAppearance,
    onOverrideChange,
}: {
    overrideWidgetAppearance: boolean;
    onOverrideChange: (overrideWidgetAppearance: boolean) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override">
            <InspectorItem className="override-toggle-item">
                <label className="override-toggle-row">
                    <input
                        type="checkbox"
                        checked={overrideWidgetAppearance}
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
    appearance: AppearanceSettings;
    onAppearancePatch: (patch: GlobalSettings["appearanceDefaults"]) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override Appearance">
            <GraphicTypeSetting
                value={appearance.graphicType}
                onValueChange={(graphicType) => onAppearancePatch({ graphicType })}
            />
            <CircleStyleSetting
                value={appearance.circleStyle}
                onValueChange={(circleStyle) => onAppearancePatch({ circleStyle })}
                disabled={appearance.graphicType !== "circular"}
            />
            <SelectSetting
                label="Graphic Style"
                value={appearance.graphicStyle}
                optionList={graphicStyleOptionList}
                onValueChange={(graphicStyle) => onAppearancePatch({ graphicStyle })}
            />
            <ColorSetting
                label="Tint Color"
                value={appearance.usageColors.solidColor}
                onValueChange={(solidColor) => onAppearancePatch({ usageColors: { solidColor } })}
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
                        value={appearance.lowThreshold}
                        minimum={0}
                        step={1}
                        onValueChange={(value) => onAppearancePatch({
                            lowThreshold: value,
                        })}
                    />
                    <NumberSetting
                        label="High Threshold"
                        value={appearance.highThreshold}
                        minimum={0}
                        step={1}
                        onValueChange={(value) => onAppearancePatch({
                            highThreshold: value,
                        })}
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
    network: NetworkDefaultSettings;
    onNetworkPatch: (patch: GlobalSettings["networkDefaults"]) => void;
}): React.JSX.Element {
    const isAutoScale = network.networkScaleMode === "auto";

    return (
        <SettingsSection title="Network Defaults">
            <SelectSetting
                label="Unit"
                value={network.networkUnitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(networkUnitBase) => onNetworkPatch({ networkUnitBase })}
            />
            <SelectSetting
                label="Scale"
                value={network.networkScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(networkScaleMode) => onNetworkPatch({ networkScaleMode })}
            />
            <NumberSetting
                label="Download Max"
                value={network.maximumDownloadSpeedMbps}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(value) => onNetworkPatch({
                    maximumDownloadSpeedMbps: value,
                })}
            />
            <NumberSetting
                label="Upload Max"
                value={network.maximumUploadSpeedMbps}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(value) => onNetworkPatch({
                    maximumUploadSpeedMbps: value,
                })}
            />
        </SettingsSection>
    );
}

function DiskThroughputDefaultsSection({
    diskThroughput,
    onDiskThroughputPatch,
}: {
    diskThroughput: DiskThroughputDefaultSettings;
    onDiskThroughputPatch: (patch: GlobalSettings["diskThroughputDefaults"]) => void;
}): React.JSX.Element {
    const isAutoScale = diskThroughput.diskThroughputScaleMode === "auto";

    return (
        <SettingsSection title="Disk Throughput Defaults">
            <SelectSetting
                label="Scale"
                value={diskThroughput.diskThroughputScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(diskThroughputScaleMode) => onDiskThroughputPatch({ diskThroughputScaleMode })}
            />
            <NumberSetting
                label="Read Max"
                value={diskThroughput.maximumDiskReadThroughputMebibytesPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(value) => onDiskThroughputPatch({
                    maximumDiskReadThroughputMebibytesPerSecond: value,
                })}
            />
            <NumberSetting
                label="Write Max"
                value={diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
                onValueChange={(value) => onDiskThroughputPatch({
                    maximumDiskWriteThroughputMebibytesPerSecond: value,
                })}
            />
        </SettingsSection>
    );
}

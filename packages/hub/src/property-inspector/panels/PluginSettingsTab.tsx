import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { InspectorItem } from "../components/InspectorItem";
import { ColorRampSettings } from "./ColorSettings";
import { SettingsSection } from "./SettingsSection";
import {
    graphicStyleOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";
import type {
    ResolvedDiskThroughputDisplaySettings,
    ResolvedGlobalColorOverride,
    ResolvedGlobalLayoutStyleOverride,
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
            <GlobalOverrideSection
                isGlobalOverrideEnabled={resolvedSettings.globalOverrideEnabled}
                onOverrideChange={(globalOverrideEnabled) => onSettingsPatch({ globalOverrideEnabled })}
            />
            {resolvedSettings.globalOverrideEnabled && (
                <>
                    <LayoutStyleOverrideSection
                        layoutStyleOverride={resolvedSettings.layoutStyleOverride}
                        onOverrideChange={(layoutStyleOverrideEnabled) => onSettingsPatch({
                            layoutStyleOverrideEnabled,
                        })}
                        onLayoutStylePatch={(layoutStyle) => onSettingsPatch({ layoutStyle })}
                    />
                    <ColorOverrideSection
                        colorOverride={resolvedSettings.colorOverride}
                        onOverrideChange={(colorOverrideEnabled) => onSettingsPatch({
                            colorOverrideEnabled,
                        })}
                        onColorPatch={(color) => onSettingsPatch({ color })}
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
                        Apply selected layout, style, and color settings to every widget.
                    </p>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

function LayoutStyleOverrideSection({
    layoutStyleOverride,
    onOverrideChange,
    onLayoutStylePatch,
}: {
    layoutStyleOverride: ResolvedGlobalLayoutStyleOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onLayoutStylePatch: (patch: NonNullable<StoredGlobalSettingsPatch["layoutStyle"]>) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Layout & Style Override">
            <OverrideSubsectionToggle
                label="Override layout and style"
                isEnabled={layoutStyleOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {layoutStyleOverride && (
                <>
                    <GraphicTypeSetting
                        value={layoutStyleOverride.viewLayout}
                        onValueChange={(viewLayout) => onLayoutStylePatch({ viewLayout })}
                    />
                    <CircleStyleSetting
                        value={layoutStyleOverride.circleStyle}
                        onValueChange={(circleStyle) => onLayoutStylePatch({ circleStyle })}
                        disabled={layoutStyleOverride.viewLayout !== "circular"}
                    />
                    <SelectSetting
                        label="Graphic Style"
                        value={layoutStyleOverride.theme}
                        optionList={graphicStyleOptionList}
                        onValueChange={(theme) => onLayoutStylePatch({ theme })}
                    />
                </>
            )}
        </SettingsSection>
    );
}

function ColorOverrideSection({
    colorOverride,
    onOverrideChange,
    onColorPatch,
}: {
    colorOverride: ResolvedGlobalColorOverride | undefined;
    onOverrideChange: (isEnabled: boolean) => void;
    onColorPatch: (patch: NonNullable<StoredGlobalSettingsPatch["color"]>) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Color Override">
            <OverrideSubsectionToggle
                label="Override color"
                isEnabled={colorOverride !== undefined}
                onValueChange={onOverrideChange}
            />
            {colorOverride && (
                <ColorRampSettings
                    colorMode={colorOverride.colorMode}
                    colors={colorOverride.colors}
                    lowColorThresholdPercent={colorOverride.lowColorThresholdPercent}
                    highColorThresholdPercent={colorOverride.highColorThresholdPercent}
                    onColorModeChange={(colorMode) => onColorPatch({ colorMode })}
                    onColorRampPatch={(colors) => onColorPatch({ colors })}
                    onThresholdPatch={onColorPatch}
                />
            )}
        </SettingsSection>
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

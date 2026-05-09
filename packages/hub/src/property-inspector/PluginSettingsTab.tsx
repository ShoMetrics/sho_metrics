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
    updatePluginAppearanceDefaults,
    updatePluginAppearanceNumber,
    updatePluginDiskThroughputDefaults,
    updatePluginDiskThroughputOptionalNumber,
    updatePluginNetworkDefaults,
    updatePluginNetworkOptionalNumber,
    updatePluginSettings,
    updatePluginUsageColors,
} from "./plugin-settings-updates";
import {
    type PluginGlobalSettings,
} from "../settings/widget-settings";

interface PluginSettingsTabProps {
    settings: PluginGlobalSettings;
    onSettingsChange: (settings: PluginGlobalSettings) => void;
}

export function PluginSettingsTab({ settings, onSettingsChange }: PluginSettingsTabProps): React.JSX.Element {
    return (
        <div>
            <OverrideSection
                settings={settings}
                onOverrideChange={(overrideWidgetAppearance) => {
                    onSettingsChange(updatePluginSettings(settings, { overrideWidgetAppearance }));
                }}
            />
            {settings.overrideWidgetAppearance && (
                <OverrideAppearanceSection
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                />
            )}
            <NetworkDefaultsSection
                settings={settings}
                onSettingsChange={onSettingsChange}
            />
            <DiskThroughputDefaultsSection
                settings={settings}
                onSettingsChange={onSettingsChange}
            />
        </div>
    );
}

function OverrideSection({
    settings,
    onOverrideChange,
}: {
    settings: PluginGlobalSettings;
    onOverrideChange: (overrideWidgetAppearance: boolean) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override">
            <InspectorItem className="override-toggle-item">
                <label className="override-toggle-row">
                    <input
                        type="checkbox"
                        checked={settings.overrideWidgetAppearance}
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
    settings,
    onSettingsChange,
}: {
    settings: PluginGlobalSettings;
    onSettingsChange: (settings: PluginGlobalSettings) => void;
}): React.JSX.Element {
    return (
        <SettingsSection title="Override Appearance">
            <GraphicTypeSetting
                value={settings.appearanceDefaults.graphicType}
                onValueChange={(graphicType) => {
                    onSettingsChange(updatePluginAppearanceDefaults(settings, { graphicType }));
                }}
            />
            <CircleStyleSetting
                value={settings.appearanceDefaults.circleStyle}
                onValueChange={(circleStyle) => {
                    onSettingsChange(updatePluginAppearanceDefaults(settings, { circleStyle }));
                }}
                disabled={settings.appearanceDefaults.graphicType !== "circular"}
            />
            <SelectSetting
                label="Graphic Style"
                value={settings.appearanceDefaults.graphicStyle}
                optionList={graphicStyleOptionList}
                onValueChange={(graphicStyle) => {
                    onSettingsChange(updatePluginAppearanceDefaults(settings, { graphicStyle }));
                }}
            />
            <ColorSetting
                label="Tint Color"
                value={settings.appearanceDefaults.usageColors.solidColor}
                onValueChange={(solidColor) => {
                    onSettingsChange(updatePluginUsageColors(settings, { solidColor }));
                }}
            />
            <SelectSetting
                label="Color Mode"
                value={settings.appearanceDefaults.colorMode}
                optionList={colorModeOptionList}
                onValueChange={(colorMode) => {
                    onSettingsChange(updatePluginAppearanceDefaults(settings, { colorMode }));
                }}
            />
            {settings.appearanceDefaults.colorMode === "threshold" && (
                <>
                    <NumberSetting
                        label="Low Threshold"
                        value={String(settings.appearanceDefaults.lowThreshold)}
                        minimum={0}
                        step={1}
                        onValueChange={(value) => {
                            onSettingsChange(updatePluginAppearanceNumber(settings, "lowThreshold", value));
                        }}
                    />
                    <NumberSetting
                        label="High Threshold"
                        value={String(settings.appearanceDefaults.highThreshold)}
                        minimum={0}
                        step={1}
                        onValueChange={(value) => {
                            onSettingsChange(updatePluginAppearanceNumber(settings, "highThreshold", value));
                        }}
                    />
                </>
            )}
        </SettingsSection>
    );
}

function NetworkDefaultsSection({
    settings,
    onSettingsChange,
}: {
    settings: PluginGlobalSettings;
    onSettingsChange: (settings: PluginGlobalSettings) => void;
}): React.JSX.Element {
    const isAutoScale = settings.networkDefaults.networkScaleMode === "auto";

    return (
        <SettingsSection title="Network Defaults">
            <SelectSetting
                label="Unit"
                value={settings.networkDefaults.networkUnitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(networkUnitBase) => {
                    onSettingsChange(updatePluginNetworkDefaults(settings, { networkUnitBase }));
                }}
            />
            <SelectSetting
                label="Scale"
                value={settings.networkDefaults.networkScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(networkScaleMode) => {
                    onSettingsChange(updatePluginNetworkDefaults(settings, { networkScaleMode }));
                }}
            />
            <NumberSetting
                label="Download Max"
                value={String(settings.networkDefaults.maximumDownloadSpeedMbps ?? "")}
                minimum={1}
                step={1}
                disabled={isAutoScale}
                onValueChange={(value) => {
                    onSettingsChange(updatePluginNetworkOptionalNumber(settings, "maximumDownloadSpeedMbps", value));
                }}
            />
            <NumberSetting
                label="Upload Max"
                value={String(settings.networkDefaults.maximumUploadSpeedMbps ?? "")}
                minimum={1}
                step={1}
                disabled={isAutoScale}
                onValueChange={(value) => {
                    onSettingsChange(updatePluginNetworkOptionalNumber(settings, "maximumUploadSpeedMbps", value));
                }}
            />
        </SettingsSection>
    );
}

function DiskThroughputDefaultsSection({
    settings,
    onSettingsChange,
}: {
    settings: PluginGlobalSettings;
    onSettingsChange: (settings: PluginGlobalSettings) => void;
}): React.JSX.Element {
    const isAutoScale = settings.diskThroughputDefaults.diskThroughputScaleMode === "auto";

    return (
        <SettingsSection title="Disk Throughput Defaults">
            <SelectSetting
                label="Scale"
                value={settings.diskThroughputDefaults.diskThroughputScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(diskThroughputScaleMode) => {
                    onSettingsChange(updatePluginDiskThroughputDefaults(settings, { diskThroughputScaleMode }));
                }}
            />
            <NumberSetting
                label="Read Max"
                value={String(settings.diskThroughputDefaults.maximumDiskReadThroughputMebibytesPerSecond ?? "")}
                minimum={1}
                step={1}
                disabled={isAutoScale}
                onValueChange={(value) => {
                    onSettingsChange(updatePluginDiskThroughputOptionalNumber(
                        settings,
                        "maximumDiskReadThroughputMebibytesPerSecond",
                        value,
                    ));
                }}
            />
            <NumberSetting
                label="Write Max"
                value={String(settings.diskThroughputDefaults.maximumDiskWriteThroughputMebibytesPerSecond ?? "")}
                minimum={1}
                step={1}
                disabled={isAutoScale}
                onValueChange={(value) => {
                    onSettingsChange(updatePluginDiskThroughputOptionalNumber(
                        settings,
                        "maximumDiskWriteThroughputMebibytesPerSecond",
                        value,
                    ));
                }}
            />
        </SettingsSection>
    );
}

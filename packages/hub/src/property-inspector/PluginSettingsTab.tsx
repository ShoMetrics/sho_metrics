import { SectionHeading } from "./components/SectionHeading";
import {
    normalizePluginGlobalSettings,
    type PluginGlobalSettings,
} from "../settings/widget-settings";
import type { InspectorControlValue } from "./schema";

interface PluginSettingsTabProps {
    settings: PluginGlobalSettings;
    onSettingsChange: (settings: PluginGlobalSettings) => void;
}

export function PluginSettingsTab({ settings, onSettingsChange }: PluginSettingsTabProps): React.JSX.Element {
    const updateRootSetting = (key: "overrideWidgetAppearance", value: InspectorControlValue): void => {
        onSettingsChange(normalizePluginGlobalSettings({
            ...settings,
            [key]: value,
        }));
    };
    const updateAppearanceSetting = (key: string, value: InspectorControlValue): void => {
        onSettingsChange(normalizePluginGlobalSettings({
            ...settings,
            appearanceDefaults: {
                ...settings.appearanceDefaults,
                [key]: value,
            },
        }));
    };
    const updateNetworkSetting = (key: string, value: InspectorControlValue): void => {
        onSettingsChange(normalizePluginGlobalSettings({
            ...settings,
            networkDefaults: {
                ...settings.networkDefaults,
                [key]: value,
            },
        }));
    };
    const updateDiskThroughputSetting = (key: string, value: InspectorControlValue): void => {
        onSettingsChange(normalizePluginGlobalSettings({
            ...settings,
            diskThroughputDefaults: {
                ...settings.diskThroughputDefaults,
                [key]: value,
            },
        }));
    };

    return (
        <div>
            <section className="settings-section">
                <SectionHeading text="Override" variant="section" />
                <sdpi-item className="override-toggle-item">
                    <label className="override-toggle-row">
                        <input
                            type="checkbox"
                            checked={settings.overrideWidgetAppearance}
                            onChange={(event) => updateRootSetting("overrideWidgetAppearance", event.currentTarget.checked)}
                        />
                        <span className="override-toggle-title">Override Widgets</span>
                        <span className="override-toggle-note">
                            When enabled, widget appearance settings are disabled but kept.
                        </span>
                    </label>
                </sdpi-item>
            </section>

            {settings.overrideWidgetAppearance && (
                <section className="settings-section">
                    <SectionHeading text="Override Appearance" variant="section" />
                    <sdpi-item label="Graphic Type">
                        <select
                            className="native-select"
                            value={settings.appearanceDefaults.graphicType}
                            onChange={(event) => updateAppearanceSetting("graphicType", event.currentTarget.value)}
                        >
                            <option value="circular">Circular</option>
                            <option value="text">Text</option>
                            <option value="linear">Linear</option>
                            <option value="dashed-line">Sparkline</option>
                        </select>
                    </sdpi-item>
                    <sdpi-item label="Circle Style">
                        <select
                            className="native-select"
                            value={settings.appearanceDefaults.circleStyle}
                            disabled={settings.appearanceDefaults.graphicType !== "circular"}
                            onChange={(event) => updateAppearanceSetting("circleStyle", event.currentTarget.value)}
                        >
                            <option value="value">Value</option>
                            <option value="compact">Compact</option>
                            <option value="gauge">Gauge</option>
                        </select>
                    </sdpi-item>
                    <sdpi-item label="Graphic Style">
                        <select
                            className="native-select"
                            value={settings.appearanceDefaults.graphicStyle}
                            onChange={(event) => updateAppearanceSetting("graphicStyle", event.currentTarget.value)}
                        >
                            <option value="flat">Flat</option>
                            <option value="cupertino-glass">Cupertino Glass</option>
                        </select>
                    </sdpi-item>
                    <sdpi-item label="Tint Color">
                        <sdpi-color
                            value={settings.appearanceDefaults.solidColor}
                            default={settings.appearanceDefaults.solidColor}
                            onInput={(event) => updateAppearanceSetting("solidColor", readColorValue(event))}
                            onChange={(event) => updateAppearanceSetting("solidColor", readColorValue(event))}
                        />
                    </sdpi-item>
                    <sdpi-item label="Color Mode">
                        <select
                            className="native-select"
                            value={settings.appearanceDefaults.colorMode}
                            onChange={(event) => updateAppearanceSetting("colorMode", event.currentTarget.value)}
                        >
                            <option value="solid">Solid</option>
                            <option value="threshold">Dynamic</option>
                        </select>
                    </sdpi-item>
                    {settings.appearanceDefaults.colorMode === "threshold" && (
                        <>
                            <sdpi-item label="Low Threshold">
                                <input
                                    className="native-input"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={settings.appearanceDefaults.lowThreshold}
                                    onChange={(event) => updateAppearanceSetting("lowThreshold", event.currentTarget.value)}
                                />
                            </sdpi-item>
                            <sdpi-item label="High Threshold">
                                <input
                                    className="native-input"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={settings.appearanceDefaults.highThreshold}
                                    onChange={(event) => updateAppearanceSetting("highThreshold", event.currentTarget.value)}
                                />
                            </sdpi-item>
                        </>
                    )}
                </section>
            )}

            <section className="settings-section">
                <SectionHeading text="Network Defaults" variant="section" />
                <sdpi-item label="Unit">
                    <select
                        className="native-select"
                        value={settings.networkDefaults.networkUnitBase}
                        onChange={(event) => updateNetworkSetting("networkUnitBase", event.currentTarget.value)}
                    >
                        <option value="byte">Byte/s</option>
                        <option value="bit">Bit/s</option>
                    </select>
                </sdpi-item>
                <sdpi-item label="Scale">
                    <select
                        className="native-select"
                        value={settings.networkDefaults.networkScaleMode}
                        onChange={(event) => updateNetworkSetting("networkScaleMode", event.currentTarget.value)}
                    >
                        <option value="auto">Auto</option>
                        <option value="custom">Custom</option>
                    </select>
                </sdpi-item>
                <sdpi-item label="Download Max">
                    <input
                        className="native-input"
                        type="number"
                        min={1}
                        step={1}
                        value={settings.networkDefaults.maximumDownloadSpeedMbps ?? ""}
                        disabled={settings.networkDefaults.networkScaleMode === "auto"}
                        onChange={(event) => updateNetworkSetting("maximumDownloadSpeedMbps", event.currentTarget.value)}
                    />
                </sdpi-item>
                <sdpi-item label="Upload Max">
                    <input
                        className="native-input"
                        type="number"
                        min={1}
                        step={1}
                        value={settings.networkDefaults.maximumUploadSpeedMbps ?? ""}
                        disabled={settings.networkDefaults.networkScaleMode === "auto"}
                        onChange={(event) => updateNetworkSetting("maximumUploadSpeedMbps", event.currentTarget.value)}
                    />
                </sdpi-item>
            </section>

            <section className="settings-section">
                <SectionHeading text="Disk Throughput Defaults" variant="section" />
                <sdpi-item label="Scale">
                    <select
                        className="native-select"
                        value={settings.diskThroughputDefaults.diskThroughputScaleMode}
                        onChange={(event) => updateDiskThroughputSetting("diskThroughputScaleMode", event.currentTarget.value)}
                    >
                        <option value="auto">Auto</option>
                        <option value="custom">Custom</option>
                    </select>
                </sdpi-item>
                <sdpi-item label="Read Max">
                    <input
                        className="native-input"
                        type="number"
                        min={1}
                        step={1}
                        value={settings.diskThroughputDefaults.maximumDiskReadThroughputMebibytesPerSecond ?? ""}
                        disabled={settings.diskThroughputDefaults.diskThroughputScaleMode === "auto"}
                        onChange={(event) => updateDiskThroughputSetting(
                            "maximumDiskReadThroughputMebibytesPerSecond",
                            event.currentTarget.value,
                        )}
                    />
                </sdpi-item>
                <sdpi-item label="Write Max">
                    <input
                        className="native-input"
                        type="number"
                        min={1}
                        step={1}
                        value={settings.diskThroughputDefaults.maximumDiskWriteThroughputMebibytesPerSecond ?? ""}
                        disabled={settings.diskThroughputDefaults.diskThroughputScaleMode === "auto"}
                        onChange={(event) => updateDiskThroughputSetting(
                            "maximumDiskWriteThroughputMebibytesPerSecond",
                            event.currentTarget.value,
                        )}
                    />
                </sdpi-item>
            </section>
        </div>
    );
}

function readColorValue(event: React.SyntheticEvent): string {
    const target = event.target as { value?: string };
    return String(target.value ?? "");
}

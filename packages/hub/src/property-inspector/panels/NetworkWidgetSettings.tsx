import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { resolveNetworkInterfaceOptions } from "../select-options/runtime-select-options";
import {
    NetworkChannelColorSettings,
    StandardColorSettings,
} from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import type { ResolvedNetworkMetricTarget } from "../../settings/resolved-settings";
import {
    networkDirectionOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";

type NetworkWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedNetworkMetricTarget;
};

export function NetworkWidgetSettings(props: NetworkWidgetSettingsProps): React.JSX.Element {
    return (
        <>
            <NetworkMetricSettings {...props} />
            <AppearanceSettings {...props} />
            <NetworkScaleSettings {...props} />
            <LineSettings {...props} />
            {props.target.reading.direction === "both" ? (
                <NetworkChannelColorSettings {...props} />
            ) : (
                <StandardColorSettings {...props} />
            )}
            <PollingSettings {...props} />
        </>
    );
}

function NetworkMetricSettings({
    context,
    target,
    onSettingsPatch,
}: NetworkWidgetSettingsProps): React.JSX.Element {
    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="Network Metric"
                value={target.reading.direction}
                optionList={networkDirectionOptionList}
                onValueChange={(direction) => onSettingsPatch({
                    network: { direction },
                })}
            />
            {context.resolved.widget.slot.appearance.view.selectedView === "circle" && (
                <InspectorItem className="note-item note-item-default">
                    <p className="section-note">Upload and download split the circle into two halves.</p>
                </InspectorItem>
            )}
            <SelectSetting
                label="Network Interface"
                value={target.interfaceId ?? ""}
                optionList={resolveNetworkInterfaceOptions(context)}
                onValueChange={(interfaceId) => onSettingsPatch({
                    network: { interfaceId },
                })}
            />
        </SettingsSection>
    );
}

function NetworkScaleSettings({
    target,
    onSettingsPatch,
}: NetworkWidgetSettingsProps): React.JSX.Element {
    const display = target.reading.display;
    const isAutoScale = display.scaleMode === "auto";

    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Scale"
                value={display.scaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(scaleMode) => onSettingsPatch({
                    network: { scaleMode },
                })}
            />
            <NumberSetting
                label="Upload Max (Mbps)"
                value={display.maximumUploadSpeedMegabitsPerSecond}
                onValueChange={(maximumUploadSpeedMegabitsPerSecond) => onSettingsPatch({
                    network: {
                        scaleMode: "custom",
                        maximumUploadSpeedMegabitsPerSecond,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <NumberSetting
                label="Download Max (Mbps)"
                value={display.maximumDownloadSpeedMegabitsPerSecond}
                onValueChange={(maximumDownloadSpeedMegabitsPerSecond) => onSettingsPatch({
                    network: {
                        scaleMode: "custom",
                        maximumDownloadSpeedMegabitsPerSecond,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <SelectSetting
                label="Unit"
                value={display.unitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(unitBase) => onSettingsPatch({
                    network: { unitBase },
                })}
            />
        </SettingsSection>
    );
}

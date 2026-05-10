import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { resolveNetworkInterfaceOptions } from "../select-options/runtime-select-options";
import {
    NetworkChannelColorSettings,
    StandardColorSettings,
    usesNetworkChannelColorSettings,
} from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    networkDirectionOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";

export function NetworkWidgetSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <LayoutSettings {...props} />
            <NetworkMetricSettings {...props} />
            <NetworkScaleSettings {...props} />
            <SparklineSettings {...props} />
            {usesNetworkChannelColorSettings(props.context) ? (
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
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="Network Metric"
                value={context.resolved.metric.networkDirection}
                optionList={networkDirectionOptionList}
                onValueChange={(networkDirection) => onSettingsPatch({
                    metric: { networkDirection },
                })}
            />
            {context.resolved.appearance.graphicType === "circular" && (
                <InspectorItem className="note-item note-item-default">
                    <p className="section-note">Download and upload split the circle into two halves.</p>
                </InspectorItem>
            )}
            <SelectSetting
                label="Network Interface"
                value={context.resolved.metric.networkInterfaceId}
                optionList={resolveNetworkInterfaceOptions(context)}
                onValueChange={(networkInterfaceId) => onSettingsPatch({
                    metric: { networkInterfaceId },
                })}
            />
        </SettingsSection>
    );
}

function NetworkScaleSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const isAutoScale = context.resolved.network.networkScaleMode === "auto";

    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Scale"
                value={context.resolved.network.networkScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(networkScaleMode) => onSettingsPatch({
                    networkOverrides: { networkScaleMode },
                })}
            />
            <NumberSetting
                label="Download Max (Mbps)"
                value={context.resolved.network.maximumDownloadSpeedMbps}
                onValueChange={(maximumDownloadSpeedMbps) => onSettingsPatch({
                    networkOverrides: {
                        networkScaleMode: "custom",
                        maximumDownloadSpeedMbps,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <NumberSetting
                label="Upload Max (Mbps)"
                value={context.resolved.network.maximumUploadSpeedMbps}
                onValueChange={(maximumUploadSpeedMbps) => onSettingsPatch({
                    networkOverrides: {
                        networkScaleMode: "custom",
                        maximumUploadSpeedMbps,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <SelectSetting
                label="Unit"
                value={context.resolved.network.networkUnitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(networkUnitBase) => onSettingsPatch({
                    networkOverrides: { networkUnitBase },
                })}
            />
        </SettingsSection>
    );
}

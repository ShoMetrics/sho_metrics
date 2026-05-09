import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { resolveNetworkInterfaceOptions } from "../options";
import {
    LayoutSettings,
    NetworkChannelColorSettings,
    PollingSettings,
    SparklineSettings,
    StandardColorSettings,
    type WidgetSettingsPanelProps,
    usesNetworkChannelColorSettings,
} from "./CommonSettings";
import { SettingsSection } from "./SettingsSection";
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
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Metric">
            <SelectSetting
                target="networkDirection"
                label="Network Metric"
                optionList={networkDirectionOptionList}
                context={context}
                onSettingChange={onSettingChange}
            />
            {context.resolved.appearance.graphicType === "circular" && (
                <InspectorItem className="note-item note-item-default">
                    <p className="section-note">Download and upload split the circle into two halves.</p>
                </InspectorItem>
            )}
            <SelectSetting
                target="networkInterfaceId"
                label="Network Interface"
                optionList={resolveNetworkInterfaceOptions(context)}
                context={context}
                onSettingChange={onSettingChange}
            />
        </SettingsSection>
    );
}

function NetworkScaleSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const isAutoScale = context.resolved.network.networkScaleMode === "auto";

    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                target="networkScaleMode"
                label="Scale"
                optionList={scaleModeOptionList}
                context={context}
                onSettingChange={onSettingChange}
            />
            <NumberSetting
                target="maximumDownloadSpeedMbps"
                label="Download Max (Mbps)"
                minimum={1}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
                disabled={isAutoScale}
            />
            <NumberSetting
                target="maximumUploadSpeedMbps"
                label="Upload Max (Mbps)"
                minimum={1}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
                disabled={isAutoScale}
            />
            <SelectSetting
                target="networkUnitBase"
                label="Unit"
                optionList={networkUnitBaseOptionList}
                context={context}
                onSettingChange={onSettingChange}
            />
        </SettingsSection>
    );
}

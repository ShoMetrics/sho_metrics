import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { resolveNetworkInterfaceOptions } from "../options";
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
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="Network Metric"
                value={context.resolved.metric.networkDirection}
                optionList={networkDirectionOptionList}
                onValueChange={(value) => onSettingChange("networkDirection", value)}
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
                onValueChange={(value) => onSettingChange("networkInterfaceId", value)}
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
                label="Scale"
                value={context.resolved.network.networkScaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(value) => onSettingChange("networkScaleMode", value)}
            />
            <NumberSetting
                label="Download Max (Mbps)"
                value={String(context.resolved.network.maximumDownloadSpeedMbps ?? "")}
                onValueChange={(value) => onSettingChange("maximumDownloadSpeedMbps", value)}
                minimum={1}
                step={1}
                disabled={isAutoScale}
            />
            <NumberSetting
                label="Upload Max (Mbps)"
                value={String(context.resolved.network.maximumUploadSpeedMbps ?? "")}
                onValueChange={(value) => onSettingChange("maximumUploadSpeedMbps", value)}
                minimum={1}
                step={1}
                disabled={isAutoScale}
            />
            <SelectSetting
                label="Unit"
                value={context.resolved.network.networkUnitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(value) => onSettingChange("networkUnitBase", value)}
            />
        </SettingsSection>
    );
}

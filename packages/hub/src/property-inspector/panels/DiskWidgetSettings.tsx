import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import { resolveDiskAutoLinearLabel, resolveDiskVolumeOptions, resolveSelectedDiskVolumeLabel } from "../options";
import { readInspectorControlValue } from "../widget-setting-bindings";
import {
    DiskThroughputChannelColorSettings,
    LayoutSettings,
    PollingSettings,
    SparklineSettings,
    StandardColorSettings,
    type WidgetSettingsPanelProps,
    usesDiskThroughputChannelColorSettings,
} from "./CommonSettings";
import { SettingsSection } from "./SettingsSection";
import {
    diskMetricKindOptionList,
    diskThroughputDirectionOptionList,
    diskUsageDisplayModeOptionList,
    scaleModeOptionList,
} from "./setting-options";

export function DiskWidgetSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const isThroughput = props.context.resolved.metric.diskMetricKind === "throughput";

    return (
        <>
            <LayoutSettings {...props} />
            {isThroughput ? (
                <DiskThroughputSettings {...props} />
            ) : (
                <DiskUsageSettings {...props} />
            )}
            {usesDiskThroughputChannelColorSettings(props.context) ? (
                <DiskThroughputChannelColorSettings {...props} />
            ) : (
                <StandardColorSettings {...props} />
            )}
            <PollingSettings {...props} />
        </>
    );
}

function DiskUsageSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const graphicType = props.context.resolved.appearance.graphicType;

    return (
        <>
            <SettingsSection title="Metric">
                <DiskMetricKindSetting {...props} />
                <SelectSetting
                    target="diskVolumeId"
                    label="Volume"
                    optionList={resolveDiskVolumeOptions(props.context)}
                    context={props.context}
                    onSettingChange={props.onSettingChange}
                />
            </SettingsSection>
            {(graphicType === "circular" || graphicType === "text") && (
                <SettingsSection title="Scale & Units">
                    <SelectSetting
                        target="diskUsageDisplayMode"
                        label="Usage Display"
                        optionList={diskUsageDisplayModeOptionList}
                        context={props.context}
                        onSettingChange={props.onSettingChange}
                    />
                </SettingsSection>
            )}
            {graphicType === "linear" && <DiskUsageLabelSettings {...props} />}
            <SparklineSettings {...props} />
        </>
    );
}

function DiskThroughputSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const isAutoScale = props.context.resolved.diskThroughput.diskThroughputScaleMode === "auto";

    return (
        <>
            <SettingsSection title="Metric">
                <DiskMetricKindSetting {...props} />
                <SelectSetting
                    target="diskThroughputDirection"
                    label="Direction"
                    optionList={diskThroughputDirectionOptionList}
                    context={props.context}
                    onSettingChange={props.onSettingChange}
                />
            </SettingsSection>
            <SettingsSection title="Scale & Units">
                <SelectSetting
                    target="diskThroughputScaleMode"
                    label="Scale"
                    optionList={scaleModeOptionList}
                    context={props.context}
                    onSettingChange={props.onSettingChange}
                />
                <NumberSetting
                    target="maximumDiskReadThroughputMebibytesPerSecond"
                    label="Read Max (MiB/s)"
                    minimum={1}
                    step={1}
                    context={props.context}
                    onSettingChange={props.onSettingChange}
                    disabled={isAutoScale}
                />
                <NumberSetting
                    target="maximumDiskWriteThroughputMebibytesPerSecond"
                    label="Write Max (MiB/s)"
                    minimum={1}
                    step={1}
                    context={props.context}
                    onSettingChange={props.onSettingChange}
                    disabled={isAutoScale}
                />
            </SettingsSection>
            <SparklineSettings {...props} />
        </>
    );
}

function DiskMetricKindSetting({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const optionList = context.isWindows
        ? diskMetricKindOptionList.filter(option => option.value !== "throughput")
        : diskMetricKindOptionList;

    return (
        <SelectSetting
            target="diskMetricKind"
            label="Disk Metric"
            optionList={optionList}
            context={context}
            onSettingChange={onSettingChange}
        />
    );
}

function DiskUsageLabelSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const currentLabel = String(readInspectorControlValue(context, "diskLinearLabel") ?? "");
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && currentLabel.trim() !== detectedLabel;

    return (
        <SettingsSection title="Labels">
            <SectionHeading text="Display Label" />
            <TextSetting
                target="diskLinearLabel"
                label="Custom Label"
                placeholder={resolveDiskAutoLinearLabel(context)}
                context={context}
                onSettingChange={onSettingChange}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={!canUseDetectedLabel}
                        onClick={() => {
                            if (canUseDetectedLabel) {
                                onSettingChange("diskLinearLabel", detectedLabel);
                            }
                        }}
                        aria-label="Use detected label as custom label"
                    >
                        Use Detected
                    </button>
                )}
            />
            <InspectorItem label="Detected Label">
                <div className="readonly-inline">
                    <span className="readonly-text">{detectedLabel}</span>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

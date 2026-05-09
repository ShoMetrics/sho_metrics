import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import { resolveDiskAutoLinearLabel, resolveDiskVolumeOptions, resolveSelectedDiskVolumeLabel } from "../options";
import {
    DiskThroughputChannelColorSettings,
    StandardColorSettings,
    usesDiskThroughputChannelColorSettings,
} from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
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
                    label="Volume"
                    value={props.context.resolved.metric.diskVolumeId}
                    optionList={resolveDiskVolumeOptions(props.context)}
                    onValueChange={(diskVolumeId) => props.onSettingsPatch({
                        metric: { diskVolumeId },
                    })}
                />
            </SettingsSection>
            {(graphicType === "circular" || graphicType === "text") && (
                <SettingsSection title="Scale & Units">
                    <SelectSetting
                        label="Usage Display"
                        value={props.context.resolved.local.diskUsageDisplayMode}
                        optionList={diskUsageDisplayModeOptionList}
                        onValueChange={(diskUsageDisplayMode) => props.onSettingsPatch({
                            local: { diskUsageDisplayMode },
                        })}
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
                    label="Direction"
                    value={props.context.resolved.metric.diskThroughputDirection}
                    optionList={diskThroughputDirectionOptionList}
                    onValueChange={(diskThroughputDirection) => props.onSettingsPatch({
                        metric: { diskThroughputDirection },
                    })}
                />
            </SettingsSection>
            <SettingsSection title="Scale & Units">
                <SelectSetting
                    label="Scale"
                    value={props.context.resolved.diskThroughput.diskThroughputScaleMode}
                    optionList={scaleModeOptionList}
                    onValueChange={(diskThroughputScaleMode) => props.onSettingsPatch({
                        diskThroughputOverrides: { diskThroughputScaleMode },
                    })}
                />
                <NumberSetting
                    label="Read Max (MiB/s)"
                    value={props.context.resolved.diskThroughput.maximumDiskReadThroughputMebibytesPerSecond}
                    onValueChange={(maximumDiskReadThroughputMebibytesPerSecond) => props.onSettingsPatch({
                        diskThroughputOverrides: {
                            diskThroughputScaleMode: "custom",
                            maximumDiskReadThroughputMebibytesPerSecond,
                        },
                    })}
                    minimum={1}
                    step={1}
                    optional
                    disabled={isAutoScale}
                />
                <NumberSetting
                    label="Write Max (MiB/s)"
                    value={props.context.resolved.diskThroughput.maximumDiskWriteThroughputMebibytesPerSecond}
                    onValueChange={(maximumDiskWriteThroughputMebibytesPerSecond) => props.onSettingsPatch({
                        diskThroughputOverrides: {
                            diskThroughputScaleMode: "custom",
                            maximumDiskWriteThroughputMebibytesPerSecond,
                        },
                    })}
                    minimum={1}
                    step={1}
                    optional
                    disabled={isAutoScale}
                />
            </SettingsSection>
            <SparklineSettings {...props} />
        </>
    );
}

function DiskMetricKindSetting({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const optionList = context.isWindows
        ? diskMetricKindOptionList.filter(option => option.value !== "throughput")
        : diskMetricKindOptionList;

    return (
        <SelectSetting
            label="Disk Metric"
            value={context.resolved.metric.diskMetricKind}
            optionList={optionList}
            onValueChange={(diskMetricKind) => onSettingsPatch({
                metric: { diskMetricKind },
            })}
        />
    );
}

function DiskUsageLabelSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const currentLabel = context.resolved.local.diskLinearLabel;
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && currentLabel.trim() !== detectedLabel;

    return (
        <SettingsSection title="Labels">
            <SectionHeading text="Display Label" />
            <TextSetting
                label="Custom Label"
                value={currentLabel}
                onValueChange={(diskLinearLabel) => onSettingsPatch({
                    local: { diskLinearLabel },
                })}
                placeholder={resolveDiskAutoLinearLabel(context)}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={!canUseDetectedLabel}
                        onClick={() => {
                            if (canUseDetectedLabel) {
                                onSettingsPatch({
                                    local: { diskLinearLabel: detectedLabel },
                                });
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

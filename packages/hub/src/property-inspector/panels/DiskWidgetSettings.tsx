import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import {
    resolveDiskLinearLabelPlaceholder,
    resolveDiskVolumeOptions,
    resolveSelectedDiskVolume,
    resolveSelectedDiskVolumeLabel,
} from "../select-options/runtime-select-options";
import {
    DiskThroughputChannelColorSettings,
    StandardColorSettings,
} from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import type { ResolvedDiskMetricTarget } from "../../settings/resolved-settings";
import {
    diskMetricKindOptionList,
    diskThroughputDirectionOptionList,
    diskUsageDisplayModeOptionList,
    scaleModeOptionList,
} from "./setting-options";

type DiskUsageReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "usage" }>;
type DiskThroughputReading = Extract<ResolvedDiskMetricTarget["reading"], { readonly kind: "throughput" }>;

type DiskWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedDiskMetricTarget;
};

export function DiskWidgetSettings(props: DiskWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const usesThroughputChannelColors = reading.kind === "throughput"
        && reading.direction === "both"
        && props.context.resolved.widget.slot.appearance.viewLayout !== "linear";

    return (
        <>
            {reading.kind === "throughput" ? (
                <DiskThroughputSettings {...props} reading={reading} />
            ) : (
                <DiskUsageSettings {...props} reading={reading} />
            )}
            <LayoutSettings {...props} />
            {usesThroughputChannelColors ? (
                <DiskThroughputChannelColorSettings {...props} />
            ) : (
                <StandardColorSettings {...props} />
            )}
            <PollingSettings {...props} />
        </>
    );
}

function DiskUsageSettings(props: DiskWidgetSettingsProps & {
    reading: DiskUsageReading;
}): React.JSX.Element {
    const graphicType = props.context.resolved.widget.slot.appearance.viewLayout;
    const selectedDiskVolumeId = props.target.volumeId
        ?? resolveSelectedDiskVolume(props.context)?.id
        ?? "";

    return (
        <>
            <SettingsSection title="Metric">
                <DiskMetricKindSetting {...props} currentKind={props.reading.kind} />
                <SelectSetting
                    label="Volume"
                    value={selectedDiskVolumeId}
                    optionList={resolveDiskVolumeOptions(props.context, selectedDiskVolumeId)}
                    onValueChange={(volumeId) => props.onSettingsPatch({
                        disk: { volumeId },
                    })}
                />
            </SettingsSection>
            {(graphicType === "circular" || graphicType === "text") && (
                <SettingsSection title="Scale & Units">
                    <SelectSetting
                        label="Usage Display"
                        value={props.reading.displayMode}
                        optionList={diskUsageDisplayModeOptionList}
                        onValueChange={(usageDisplayMode) => props.onSettingsPatch({
                            disk: { usageDisplayMode },
                        })}
                    />
                </SettingsSection>
            )}
            {graphicType === "linear" && <DiskUsageLabelSettings {...props} />}
            <SparklineSettings {...props} />
        </>
    );
}

function DiskThroughputSettings(props: DiskWidgetSettingsProps & {
    reading: DiskThroughputReading;
}): React.JSX.Element {
    const display = props.reading.display;
    const isAutoScale = display.scaleMode === "auto";

    return (
        <>
            <SettingsSection title="Metric">
                <DiskMetricKindSetting {...props} currentKind={props.reading.kind} />
                <SelectSetting
                    label="Direction"
                    value={props.reading.direction}
                    optionList={diskThroughputDirectionOptionList}
                    onValueChange={(throughputDirection) => props.onSettingsPatch({
                        disk: { throughputDirection },
                    })}
                />
            </SettingsSection>
            <SettingsSection title="Scale & Units">
                <SelectSetting
                    label="Scale"
                    value={display.scaleMode}
                    optionList={scaleModeOptionList}
                    onValueChange={(scaleMode) => props.onSettingsPatch({
                        disk: { scaleMode },
                    })}
                />
                <NumberSetting
                    label="Read Max (MiB/s)"
                    value={display.maximumReadThroughputMebibytesPerSecond}
                    onValueChange={(maximumReadThroughputMebibytesPerSecond) => props.onSettingsPatch({
                        disk: {
                            scaleMode: "custom",
                            maximumReadThroughputMebibytesPerSecond,
                        },
                    })}
                    minimum={1}
                    step={1}
                    optional
                    disabled={isAutoScale}
                />
                <NumberSetting
                    label="Write Max (MiB/s)"
                    value={display.maximumWriteThroughputMebibytesPerSecond}
                    onValueChange={(maximumWriteThroughputMebibytesPerSecond) => props.onSettingsPatch({
                        disk: {
                            scaleMode: "custom",
                            maximumWriteThroughputMebibytesPerSecond,
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
    currentKind,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    currentKind: ResolvedDiskMetricTarget["reading"]["kind"];
}): React.JSX.Element {
    const optionList = context.isWindows
        ? diskMetricKindOptionList.filter(option => option.value !== "throughput")
        : diskMetricKindOptionList;

    return (
        <SelectSetting
            label="Disk Metric"
            value={currentKind}
            optionList={optionList}
            onValueChange={(kind) => onSettingsPatch({
                disk: { kind },
            })}
        />
    );
}

function DiskUsageLabelSettings({
    context,
    reading,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    reading: DiskUsageReading;
}): React.JSX.Element {
    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const currentLabel = reading.linearLabel;
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && currentLabel.trim() !== detectedLabel;

    return (
        <SettingsSection title="Labels">
            <SectionHeading text="Display Label" />
            <TextSetting
                label="Custom Label"
                value={currentLabel}
                onValueChange={(linearLabel) => onSettingsPatch({
                    disk: { linearLabel },
                })}
                placeholder={resolveDiskLinearLabelPlaceholder(context)}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={!canUseDetectedLabel}
                        onClick={() => {
                            if (canUseDetectedLabel) {
                                onSettingsPatch({
                                    disk: { linearLabel: detectedLabel },
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

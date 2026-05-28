import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import {
    resolveDiskBarLabelPlaceholder,
    resolveDiskVolumeOptions,
    resolveSelectedDiskVolume,
    resolveSelectedDiskVolumeLabel,
} from "../select-options/runtime-select-options";
import {
    DiskThroughputChannelColorSettings,
    StandardColorSettings,
} from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
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

const aggregateDiskVolumeOptionList = [
    { value: "", label: "All disks" },
] as const;
const DISK_THROUGHPUT_AGGREGATE_NOTE =
    "Showing aggregate disk read/write. Per-disk monitoring is not available in this version.";

export function DiskWidgetSettings(props: DiskWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const usesThroughputChannelColors = reading.kind === "throughput"
        && reading.direction === "both";

    return (
        <>
            {reading.kind === "throughput" ? (
                <DiskThroughputSettings {...props} reading={reading} />
            ) : (
                <DiskUsageSettings {...props} reading={reading} />
            )}
            <AppearanceSettings {...props} />
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
    const selectedView = props.context.resolved.widget.slot.appearance.view.selectedView;
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
            {(selectedView === "circle" || selectedView === "text") && (
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
            {selectedView === "bar" && <DiskUsageBarLabelSettings {...props} />}
            <LineSettings {...props} />
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
                <SelectSetting
                    label="Volume"
                    value=""
                    optionList={aggregateDiskVolumeOptionList}
                    onValueChange={() => undefined}
                    disabled
                />
                <InspectorItem>
                    <div className="readonly-inline">
                        <span className="readonly-text">{DISK_THROUGHPUT_AGGREGATE_NOTE}</span>
                    </div>
                </InspectorItem>
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
            <LineSettings {...props} />
        </>
    );
}

function DiskMetricKindSetting({
    currentKind,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    currentKind: ResolvedDiskMetricTarget["reading"]["kind"];
}): React.JSX.Element {
    return (
        <SelectSetting
            label="Disk Metric"
            value={currentKind}
            optionList={diskMetricKindOptionList}
            onValueChange={(kind) => onSettingsPatch({
                disk: { kind },
            })}
        />
    );
}

function DiskUsageBarLabelSettings({
    context,
    reading,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    reading: DiskUsageReading;
}): React.JSX.Element {
    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const currentLabel = reading.barLabel;
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && currentLabel.trim() !== detectedLabel;

    return (
        <SettingsSection title="Labels">
            <SectionHeading text="Display Label" />
            <TextSetting
                label="Custom Label"
                value={currentLabel}
                onValueChange={(barLabel) => onSettingsPatch({
                    disk: { barLabel },
                })}
                placeholder={resolveDiskBarLabelPlaceholder(context)}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={!canUseDetectedLabel}
                        onClick={() => {
                            if (canUseDetectedLabel) {
                                onSettingsPatch({
                                    disk: { barLabel: detectedLabel },
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

import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { catalogMessages, diskMessages } from "../../i18n/message-groups/widgets";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
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
import {
    requireResolvedSingleMetricWidget,
    type ResolvedDiskMetricTarget,
} from "../../settings/resolved-settings";
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

export function DiskWidgetSettings(props: DiskWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const usesThroughputChannelColors = reading.kind === "throughput"
        && reading.direction === "both";

    return (
        <>
            {reading.kind === "throughput" ? (
                <DiskThroughputMetricSettings {...props} reading={reading} />
            ) : (
                <DiskUsageMetricSettings {...props} reading={reading} />
            )}
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            {reading.kind === "throughput" ? (
                <DiskThroughputScaleSettings {...props} reading={reading} />
            ) : (
                <DiskUsageExtraSettings {...props} reading={reading} />
            )}
            {usesThroughputChannelColors ? (
                <DiskThroughputChannelColorSettings {...props} />
            ) : (
                <StandardColorSettings {...props} />
            )}
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}

function DiskUsageMetricSettings(props: DiskWidgetSettingsProps & {
    reading: DiskUsageReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const selectedDiskVolumeId = props.target.volumeId
        ?? resolveSelectedDiskVolume(props.context)?.id
        ?? "";

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <DiskMetricKindSetting {...props} currentKind={props.reading.kind} />
            <SelectSetting
                label={t(commonMessages.volumeLabel)}
                value={selectedDiskVolumeId}
                optionList={resolveDiskVolumeOptions(props.context, selectedDiskVolumeId, i18n)}
                onValueChange={(volumeId) => props.onSettingsPatch({
                    disk: { volumeId },
                })}
            />
        </SettingsSection>
    );
}

function DiskUsageExtraSettings(props: DiskWidgetSettingsProps & {
    reading: DiskUsageReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const selectedView = requireResolvedSingleMetricWidget(props.context.resolved).slot.appearance.view.selectedView;

    return (
        <>
            {(selectedView === "circle" || selectedView === "text") && (
                <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
                <SelectSetting
                        label={t(diskMessages.usageDisplayLabel)}
                        value={props.reading.displayMode}
                        optionList={localizeOptionList(t, diskUsageDisplayModeOptionList, diskUsageDisplayModeMessageByValue)}
                        onValueChange={(usageDisplayMode) => props.onSettingsPatch({
                            disk: { usageDisplayMode },
                        })}
                    />
                </SettingsSection>
            )}
            {selectedView === "bar" && <DiskUsageBarLabelSettings {...props} />}
        </>
    );
}

function DiskThroughputMetricSettings(props: DiskWidgetSettingsProps & {
    reading: DiskThroughputReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <DiskMetricKindSetting {...props} currentKind={props.reading.kind} />
            <SelectSetting
                label={t(commonMessages.directionLabel)}
                value={props.reading.direction}
                optionList={localizeOptionList(t, diskThroughputDirectionOptionList, diskThroughputDirectionMessageByValue)}
                onValueChange={(throughputDirection) => props.onSettingsPatch({
                    disk: { throughputDirection },
                })}
            />
            <SelectSetting
                label={t(commonMessages.volumeLabel)}
                value=""
                optionList={localizeOptionList(t, aggregateDiskVolumeOptionList, aggregateDiskVolumeMessageByValue)}
                onValueChange={() => undefined}
                disabled
            />
            <InspectorItem>
                <div className="readonly-inline">
                    <span className="readonly-text">{t(diskMessages.diskAggregateNote)}</span>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

function DiskThroughputScaleSettings(props: DiskWidgetSettingsProps & {
    reading: DiskThroughputReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const display = props.reading.display;
    const isAutoScale = display.scaleMode === "auto";

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <SelectSetting
                label={t(commonMessages.scaleLabel)}
                value={display.scaleMode}
                optionList={localizeOptionList(t, scaleModeOptionList, scaleModeMessageByValue)}
                onValueChange={(scaleMode) => props.onSettingsPatch({
                    disk: { scaleMode },
                })}
            />
            <NumberSetting
                label={t(diskMessages.readMaxMibLabel)}
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
                label={t(diskMessages.writeMaxMibLabel)}
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
    );
}

function DiskMetricKindSetting({
    currentKind,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    currentKind: ResolvedDiskMetricTarget["reading"]["kind"];
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;

    return (
        <SelectSetting
            label={t(diskMessages.diskMetricLabel)}
            value={currentKind}
            optionList={localizeOptionList(t, diskMetricKindOptionList, diskMetricKindMessageByValue)}
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
    const i18n = useI18n();
    const { t } = i18n;
    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const currentLabel = reading.barLabel;
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && currentLabel.trim() !== detectedLabel;

    return (
        <SettingsSection title={t(commonMessages.labelsSection)}>
            <SectionHeading text={t(diskMessages.displayLabelHeading)} />
            <TextSetting
                label={t(diskMessages.customLabelLabel)}
                value={currentLabel}
                onValueChange={(barLabel) => onSettingsPatch({
                    disk: { barLabel },
                })}
                placeholder={resolveDiskBarLabelPlaceholder(context, i18n)}
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
                        aria-label={t(diskMessages.useDetectedLabelAria)}
                    >
                        {t(catalogMessages.useDetectedButton)}
                    </button>
                )}
            />
            <InspectorItem label={t(diskMessages.detectedLabelLabel)}>
                <div className="readonly-inline">
                    <span className="readonly-text">{detectedLabel}</span>
                </div>
            </InspectorItem>
        </SettingsSection>
    );
}

const diskMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    throughput: optionMessages.throughputOption,
} as const;

const diskThroughputDirectionMessageByValue = {
    both: optionMessages.readWriteOption,
    read: optionMessages.readOption,
    write: optionMessages.writeOption,
} as const;

const scaleModeMessageByValue = {
    auto: optionMessages.autoOption,
    custom: optionMessages.customOption,
} as const;

const diskUsageDisplayModeMessageByValue = {
    percentage: optionMessages.percentageOption,
    space: optionMessages.freeSpaceOption,
} as const;

const aggregateDiskVolumeMessageByValue = {
    "": optionMessages.allDisksOption,
} as const;

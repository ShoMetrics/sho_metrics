import { InspectorItem } from "../../components/InspectorItem";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { gpuMessages } from "../../../i18n/message-groups/widgets";
import { optionMessages } from "../../../i18n/message-groups/options";
import { localizeOptionList } from "../../../i18n/options";
import { useI18n } from "../../../i18n/react";
import { SelectSetting } from "../../controls/SelectSetting";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedGpuMetricTarget,
    type ResolvedGpuReading,
} from "../../../settings/resolved-settings";
import { isBuiltInMetricSupportedOnPlatform } from "../../../runtime/source-routing/metric-source-preferences";
import type { PropertyInspectorPlatform } from "../../inspector/platform";
import { StandardColorSettings } from "../controls/ColorSettings";
import { AppearanceSettings } from "../controls/AppearanceSettings";
import { PollingSettings } from "../controls/PollingSettings";
import { LineSettings } from "../controls/LineSettings";
import { MetricSourceSettings } from "../controls/MetricSourceSettings";
import { SettingsSection } from "../controls/SettingsSection";
import { PowerMaximumSetting, TemperatureMaximumSetting } from "../controls/MetricMaximumSettings";
import type { WidgetSettingsPanelProps } from "../panel-props";
import { GpuNoValueGuidanceNote, shouldShowGpuNoValueGuidance } from "../no-value-guidance";
import {
    buildGpuMetricKindOptionList,
    isGpuHardwareSummarySupportedOnPlatform,
    isSummaryMetricKind,
    resolveGpuMetricKindMetricKeys,
    summaryMetricKindOption,
    temperatureUnitOptionList,
} from "../setting-options";

type GpuTemperatureReading = Extract<ResolvedGpuReading, { readonly kind: "temperature" }>;
type GpuPowerReading = Extract<ResolvedGpuReading, { readonly kind: "power" }>;
type GpuMetricChoice = ResolvedGpuReading["kind"] | "summary";

type GpuWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedGpuMetricTarget;
};

export function GpuWidgetSettings(props: GpuWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const isSelectedReadingSupported = isGpuReadingSupportedOnCurrentPlatform(props.context.platform, props.target);

    return (
        <>
            <GpuMetricSettings {...props} />
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            {isSelectedReadingSupported
                && reading.kind === "temperature"
                && <GpuTemperatureScaleSettings {...props} reading={reading} />}
            {isSelectedReadingSupported
                && reading.kind === "power"
                && <GpuPowerScaleSettings {...props} reading={reading} />}
            <StandardColorSettings {...props} />
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}
function GpuMetricSettings({
    context,
    target,
    onSettingsPatch,
}: GpuWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const metricOptions = buildGpuMetricKindOptionList(context.platform, target.reading.kind);
    const optionList = [
        ...metricOptions,
        ...(isGpuHardwareSummarySupportedOnPlatform(context.platform) ? [summaryMetricKindOption] : []),
    ] as const satisfies readonly { readonly value: GpuMetricChoice; readonly label: string; readonly disabled?: boolean }[];
    const isSelectedReadingSupported = isGpuReadingSupportedOnCurrentPlatform(context.platform, target);
    const shouldShowNoValueGuidance = shouldShowGpuNoValueGuidance(
        context.isWindows,
        context.runtimeCache.displayedMetricReadTrace,
    );

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <SelectSetting
                label={t(gpuMessages.gpuMetricLabel)}
                value={target.reading.kind}
                optionList={localizeOptionList(t, optionList, gpuMetricKindMessageByValue)}
                onValueChange={(kind) => {
                    if (isSummaryMetricKind(kind)) {
                        onSettingsPatch({
                            hardwareSummary: {
                                switchTo: {
                                    widgetKind: "hardwareSummary",
                                    domain: "gpu",
                                },
                            },
                        });
                        return;
                    }

                    onSettingsPatch({
                        gpu: { kind },
                    });
                }}
            />
            {!isSelectedReadingSupported && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        {t(gpuMessages.unsupportedGpuMetricNotice)}
                    </p>
                </InspectorItem>
            )}
            {context.isWindows && (
                <MetricSourceSettings
                    sourcePolicy={requireResolvedSingleMetricWidget(context.resolved).slot.metric.source}
                    onSourcePatch={(source) => onSettingsPatch({ source })}
                />
            )}
            {shouldShowNoValueGuidance && (
                <GpuNoValueGuidanceNote />
            )}
        </SettingsSection>
    );
}

function GpuTemperatureScaleSettings({
    reading,
    onSettingsPatch,
}: GpuWidgetSettingsProps & {
    reading: GpuTemperatureReading;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <SelectSetting
                label={t(commonMessages.unitLabel)}
                value={reading.unit}
                optionList={localizeOptionList(t, temperatureUnitOptionList, temperatureUnitMessageByValue)}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    gpu: { temperatureUnit },
                })}
            />
            <TemperatureMaximumSetting
                value={reading.maximumCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    gpu: { maximumTemperatureCelsius },
                })}
            />
        </SettingsSection>
    );
}

function GpuPowerScaleSettings({
    reading,
    onSettingsPatch,
}: GpuWidgetSettingsProps & {
    reading: GpuPowerReading;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <PowerMaximumSetting
                value={reading.maximumWatts}
                onValueChange={(maximumGpuPowerWatts) => onSettingsPatch({
                    gpu: { maximumPowerWatts: maximumGpuPowerWatts },
                })}
            />
        </SettingsSection>
    );
}

const gpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    vram: optionMessages.vramOption,
    power: optionMessages.powerOption,
    summary: optionMessages.gpuHardwareSummaryOption,
} as const;

const temperatureUnitMessageByValue = {
    celsius: optionMessages.celsiusOption,
    fahrenheit: optionMessages.fahrenheitOption,
} as const;

function isGpuReadingSupportedOnCurrentPlatform(
    platform: PropertyInspectorPlatform,
    target: ResolvedGpuMetricTarget,
): boolean {
    return resolveGpuMetricKindMetricKeys(target.reading.kind).every(metricKey =>
        isBuiltInMetricSupportedOnPlatform(metricKey, platform),
    );
}

import { InspectorItem } from "../../components/InspectorItem";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { cpuMessages, helperMessages } from "../../../i18n/message-groups/widgets";
import { optionMessages } from "../../../i18n/message-groups/options";
import { localizeOptionList } from "../../../i18n/options";
import { useI18n } from "../../../i18n/react";
import { SelectSetting } from "../../controls/SelectSetting";
import type { ResolvedCpuMetricTarget, ResolvedCpuReading } from "../../../settings/resolved-settings";
import { StandardColorSettings } from "../controls/ColorSettings";
import { AppearanceSettings } from "../controls/AppearanceSettings";
import { PollingSettings } from "../controls/PollingSettings";
import { LineSettings } from "../controls/LineSettings";
import { SettingsSection } from "../controls/SettingsSection";
import { PowerMaximumSetting, TemperatureMaximumSetting } from "../controls/MetricMaximumSettings";
import { resolveHelperStatusGuidanceText } from "../helper-status-guidance";
import type { WidgetSettingsPanelProps } from "../panel-props";
import {
    buildCpuMetricKindOptionList,
    isCpuHardwareSummarySupportedOnPlatform,
    isSummaryMetricKind,
    resolveCpuMetricKindMetricKey,
    summaryMetricKindOption,
    temperatureUnitOptionList,
} from "../setting-options";
import { isBuiltInMetricSupportedOnPlatform } from "../../../runtime/source-routing/metric-source-preferences";

type CpuTemperatureReading = Extract<ResolvedCpuReading, { readonly kind: "temperature" }>;
type CpuPowerReading = Extract<ResolvedCpuReading, { readonly kind: "power" }>;
type CpuMetricChoice = ResolvedCpuReading["kind"] | "summary";

type CpuWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCpuMetricTarget;
};

export function CpuWidgetSettings(props: CpuWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const isSelectedReadingSupported = isCpuReadingSupportedOnCurrentPlatform(props);

    return (
        <>
            <CpuMetricSettings {...props} />
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            {isSelectedReadingSupported
                && reading.kind === "temperature"
                && <CpuTemperatureScaleSettings {...props} reading={reading} />}
            {isSelectedReadingSupported
                && reading.kind === "power"
                && <CpuPowerScaleSettings {...props} reading={reading} />}
            <StandardColorSettings {...props} />
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}

function CpuMetricSettings({
    context,
    target,
    onSettingsPatch,
}: CpuWidgetSettingsProps): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const reading = target.reading;
    const metricOptions = buildCpuMetricKindOptionList(context.platform, reading.kind);
    const optionList = [
        ...metricOptions,
        ...(isCpuHardwareSummarySupportedOnPlatform(context.platform) ? [summaryMetricKindOption] : []),
    ] as const satisfies readonly { readonly value: CpuMetricChoice; readonly label: string; readonly disabled?: boolean }[];
    const isSelectedReadingSupported = isBuiltInMetricSupportedOnPlatform(
        resolveCpuMetricKindMetricKey(reading.kind),
        context.platform,
    );
    const helperOnlyGuidance = reading.kind === "usage"
        ? undefined
        : resolveHelperStatusGuidanceText(
            context.runtimeCache.displayedMetricReadTrace?.preferredSourceStatus,
            { i18n, installSubject: "thisMetric" },
        );

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <SelectSetting
                label={t(cpuMessages.cpuMetricLabel)}
                value={reading.kind}
                optionList={localizeOptionList(t, optionList, cpuMetricKindMessageByValue)}
                onValueChange={(kind) => {
                    if (isSummaryMetricKind(kind)) {
                        onSettingsPatch({
                            hardwareSummary: {
                                switchTo: {
                                    widgetKind: "hardwareSummary",
                                    domain: "cpu",
                                },
                            },
                        });
                        return;
                    }

                    onSettingsPatch({
                        cpu: { kind },
                    });
                }}
            />
            {!isSelectedReadingSupported && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        {t(cpuMessages.unsupportedCpuMetricNotice)}
                    </p>
                </InspectorItem>
            )}
            {isSelectedReadingSupported && reading.kind !== "usage" && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(helperMessages.sourceHelperOnly)}</p>
                </InspectorItem>
            )}
            {helperOnlyGuidance !== undefined && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{helperOnlyGuidance}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function CpuTemperatureScaleSettings({
    reading,
    onSettingsPatch,
}: CpuWidgetSettingsProps & {
    reading: CpuTemperatureReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <SelectSetting
                label={t(commonMessages.unitLabel)}
                value={reading.unit}
                optionList={localizeOptionList(t, temperatureUnitOptionList, temperatureUnitMessageByValue)}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    cpu: { temperatureUnit },
                })}
            />
            <TemperatureMaximumSetting
                value={reading.maximumCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    cpu: { maximumTemperatureCelsius },
                })}
            />
        </SettingsSection>
    );
}

function CpuPowerScaleSettings({
    reading,
    onSettingsPatch,
}: CpuWidgetSettingsProps & {
    reading: CpuPowerReading;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <PowerMaximumSetting
                value={reading.maximumWatts}
                onValueChange={(maximumPowerWatts) => onSettingsPatch({
                    cpu: { maximumPowerWatts },
                })}
            />
        </SettingsSection>
    );
}

const cpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    power: optionMessages.powerOption,
    summary: optionMessages.cpuHardwareSummaryOption,
} as const;

const temperatureUnitMessageByValue = {
    celsius: optionMessages.celsiusOption,
    fahrenheit: optionMessages.fahrenheitOption,
} as const;

function isCpuReadingSupportedOnCurrentPlatform({
    context,
    target,
}: CpuWidgetSettingsProps): boolean {
    return isBuiltInMetricSupportedOnPlatform(
        resolveCpuMetricKindMetricKey(target.reading.kind),
        context.platform,
    );
}

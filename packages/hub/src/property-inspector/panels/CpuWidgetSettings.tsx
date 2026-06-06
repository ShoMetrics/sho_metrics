import { InspectorItem } from "../components/InspectorItem";
import { commonMessages } from "../../i18n/message-groups/shell";
import { cpuMessages, helperMessages } from "../../i18n/message-groups/widgets";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { ResolvedCpuMetricTarget, ResolvedCpuReading } from "../../settings/resolved-settings";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import { resolveHelperStatusGuidanceText } from "./helper-status-guidance";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    buildCpuMetricKindOptionList,
    resolveCpuMetricKindMetricKey,
    temperatureUnitOptionList,
} from "./setting-options";
import { isBuiltInMetricSupportedOnPlatform } from "../../runtime/source-routing/metric-source-preferences";

type CpuTemperatureReading = Extract<ResolvedCpuReading, { readonly kind: "temperature" }>;
type CpuPowerReading = Extract<ResolvedCpuReading, { readonly kind: "power" }>;

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
            <PollingSettings {...props} />
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
    const optionList = buildCpuMetricKindOptionList(context.platform, reading.kind);
    const isSelectedReadingSupported = isBuiltInMetricSupportedOnPlatform(
        resolveCpuMetricKindMetricKey(reading.kind),
        context.platform,
    );
    const helperOnlyGuidance = reading.kind === "usage"
        ? undefined
        : resolveHelperStatusGuidanceText(
            context.runtimeCache.displayedMetricReadAttribution?.preferredSourceStatus,
            { i18n, installSubject: "thisMetric" },
        );

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <SelectSetting
                label={t(cpuMessages.cpuMetricLabel)}
                value={reading.kind}
                optionList={localizeOptionList(t, optionList, cpuMetricKindMessageByValue)}
                onValueChange={(kind) => onSettingsPatch({
                    cpu: { kind },
                })}
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
            <NumberSetting
                label={t(commonMessages.maxTempCLabel)}
                value={reading.maximumCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    cpu: { maximumTemperatureCelsius },
                })}
                minimum={1}
                step={1}
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
            <NumberSetting
                label={t(commonMessages.maxPowerWLabel)}
                value={reading.maximumWatts}
                onValueChange={(maximumPowerWatts) => onSettingsPatch({
                    cpu: { maximumPowerWatts },
                })}
                minimum={1}
                step={1}
                optional
            />
        </SettingsSection>
    );
}

const cpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    power: optionMessages.powerOption,
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

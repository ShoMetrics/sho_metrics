import { InspectorItem } from "../components/InspectorItem";
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
            { installSubject: "this metric" },
        );

    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="CPU Metric"
                value={reading.kind}
                optionList={optionList}
                onValueChange={(kind) => onSettingsPatch({
                    cpu: { kind },
                })}
            />
            {!isSelectedReadingSupported && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        Current CPU metric is not supported on this platform. Choose a supported metric to continue.
                    </p>
                </InspectorItem>
            )}
            {isSelectedReadingSupported && reading.kind !== "usage" && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">Source: Helper only</p>
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
    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Unit"
                value={reading.unit}
                optionList={temperatureUnitOptionList}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    cpu: { temperatureUnit },
                })}
            />
            <NumberSetting
                label="Max Temp (C)"
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
    return (
        <SettingsSection title="Scale & Units">
            <NumberSetting
                label="Max Power (W)"
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

function isCpuReadingSupportedOnCurrentPlatform({
    context,
    target,
}: CpuWidgetSettingsProps): boolean {
    return isBuiltInMetricSupportedOnPlatform(
        resolveCpuMetricKindMetricKey(target.reading.kind),
        context.platform,
    );
}

import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { ResolvedGpuMetricTarget, ResolvedGpuReading } from "../../settings/resolved-settings";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    gpuMetricKindOptionList,
    temperatureUnitOptionList,
} from "./setting-options";

type GpuTemperatureReading = Extract<ResolvedGpuReading, { readonly kind: "temperature" }>;
type GpuPowerReading = Extract<ResolvedGpuReading, { readonly kind: "power" }>;

type GpuWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedGpuMetricTarget;
};

export function GpuWidgetSettings(props: GpuWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;

    return (
        <>
            <GpuMetricSettings {...props} />
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            {reading.kind === "temperature" && <GpuTemperatureScaleSettings {...props} reading={reading} />}
            {reading.kind === "power" && <GpuPowerScaleSettings {...props} reading={reading} />}
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}

function GpuMetricSettings({
    target,
    onSettingsPatch,
}: GpuWidgetSettingsProps): React.JSX.Element {
    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="GPU Metric"
                value={target.reading.kind}
                optionList={gpuMetricKindOptionList}
                onValueChange={(kind) => onSettingsPatch({
                    gpu: { kind },
                })}
            />
        </SettingsSection>
    );
}

function GpuTemperatureScaleSettings({
    reading,
    onSettingsPatch,
}: GpuWidgetSettingsProps & {
    reading: GpuTemperatureReading;
}): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Unit"
                value={reading.unit}
                optionList={temperatureUnitOptionList}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    gpu: { temperatureUnit },
                })}
            />
            <NumberSetting
                label="Max Temp (C)"
                value={reading.maximumCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    gpu: { maximumTemperatureCelsius },
                })}
                minimum={1}
                step={1}
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
    return (
        <SettingsSection title="Scale & Units">
            <NumberSetting
                label="Max Power (W)"
                value={reading.maximumWatts}
                onValueChange={(maximumGpuPowerWatts) => onSettingsPatch({
                    gpu: { maximumPowerWatts: maximumGpuPowerWatts },
                })}
                minimum={1}
                step={1}
                optional
            />
        </SettingsSection>
    );
}

import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { ResolvedGpuReading } from "../../settings/resolved-settings";
import { StandardColorSettings } from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { temperatureUnitOptionList } from "./setting-options";

export function GpuWidgetSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const reading = readGpuReading(props.context);

    return (
        <>
            <LayoutSettings {...props} />
            <SparklineSettings {...props} />
            {reading.kind === "temperature" && <GpuTemperatureScaleSettings {...props} />}
            {reading.kind === "power" && <GpuPowerScaleSettings {...props} />}
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}

function GpuTemperatureScaleSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const reading = readGpuTemperatureReading(context);

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
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    const reading = readGpuPowerReading(context);

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

function readGpuTemperatureReading(
    context: WidgetSettingsPanelProps["context"],
): Extract<ResolvedGpuReading, { kind: "temperature" }> {
    const reading = readGpuReading(context);

    if (reading.kind !== "temperature") {
        throw new Error("Expected temperature GPU metric settings.");
    }

    return reading;
}

function readGpuPowerReading(
    context: WidgetSettingsPanelProps["context"],
): Extract<ResolvedGpuReading, { kind: "power" }> {
    const reading = readGpuReading(context);

    if (reading.kind !== "power") {
        throw new Error("Expected power GPU metric settings.");
    }

    return reading;
}

function readGpuReading(context: WidgetSettingsPanelProps["context"]): ResolvedGpuReading {
    const target = context.resolved.widget.slot.metric.target;

    if (target.domain !== "gpu") {
        throw new Error("Expected GPU metric settings.");
    }

    return target.reading;
}

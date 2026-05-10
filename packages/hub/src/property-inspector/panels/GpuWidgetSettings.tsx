import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { ActionKind } from "../inspector/action-kind";
import { StandardColorSettings } from "./ColorSettings";
import { LayoutSettings } from "./LayoutSettings";
import { PollingSettings } from "./PollingSettings";
import { SparklineSettings } from "./SparklineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { temperatureUnitOptionList } from "./setting-options";

export function GpuWidgetSettings(props: WidgetSettingsPanelProps & {
    actionKind: ActionKind;
}): React.JSX.Element {
    return (
        <>
            <LayoutSettings {...props} />
            <SparklineSettings {...props} />
            {props.actionKind === "gpu-temp" && <GpuTemperatureScaleSettings {...props} />}
            {props.actionKind === "gpu-power" && <GpuPowerScaleSettings {...props} />}
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}

function GpuTemperatureScaleSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Unit"
                value={context.resolved.local.temperatureUnit}
                optionList={temperatureUnitOptionList}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    local: { temperatureUnit },
                })}
            />
            <NumberSetting
                label="Max Temp (C)"
                value={context.resolved.local.maximumTemperatureCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    local: { maximumTemperatureCelsius },
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
    return (
        <SettingsSection title="Scale & Units">
            <NumberSetting
                label="Max Power (W)"
                value={context.resolved.local.maximumGpuPowerWatts}
                onValueChange={(maximumGpuPowerWatts) => onSettingsPatch({
                    local: { maximumGpuPowerWatts },
                })}
                minimum={1}
                step={1}
                optional
            />
        </SettingsSection>
    );
}

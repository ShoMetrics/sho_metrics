import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { ActionKind } from "../settings";
import {
    LayoutSettings,
    PollingSettings,
    SparklineSettings,
    StandardColorSettings,
    type WidgetSettingsPanelProps,
} from "./CommonSettings";
import { SettingsSection } from "./SettingsSection";
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
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                target="temperatureUnit"
                label="Unit"
                optionList={temperatureUnitOptionList}
                context={context}
                onSettingChange={onSettingChange}
            />
            <NumberSetting
                target="maximumTemperatureCelsius"
                label="Max Temp (C)"
                minimum={1}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
            />
        </SettingsSection>
    );
}

function GpuPowerScaleSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <NumberSetting
                target="maximumGpuPowerWatts"
                label="Max Power (W)"
                minimum={1}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
            />
        </SettingsSection>
    );
}

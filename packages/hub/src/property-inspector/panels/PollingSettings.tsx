import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { pollingFrequencyOptionList } from "./setting-options";

export function PollingSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Update">
            <SelectSetting
                label="Polling Frequency"
                value={context.resolved.preferences.pollingFrequencySeconds}
                optionList={pollingFrequencyOptionList}
                onValueChange={(pollingFrequencySeconds) => onSettingsPatch({
                    preferences: { pollingFrequencySeconds },
                })}
            />
        </SettingsSection>
    );
}

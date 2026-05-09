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
                value={context.resolved.local.pollingFrequencySeconds}
                optionList={pollingFrequencyOptionList}
                onValueChange={(pollingFrequencySeconds) => onSettingsPatch({
                    local: { pollingFrequencySeconds },
                })}
            />
        </SettingsSection>
    );
}

import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { pollingFrequencyOptionList } from "./setting-options";

export function PollingSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Update">
            <SelectSetting
                label="Polling Frequency"
                value={String(context.resolved.local.pollingFrequencySeconds)}
                optionList={pollingFrequencyOptionList}
                onValueChange={(value) => onSettingChange("pollingFrequencySeconds", value)}
            />
        </SettingsSection>
    );
}

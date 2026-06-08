import { commonMessages } from "../../i18n/message-groups/shell";
import { useI18n } from "../../i18n/react";
import { InspectorItem } from "../components/InspectorItem";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { pollingFrequencyOptionList } from "./setting-options";

export function PollingSettings({
    context,
    onSettingsPatch,
    note,
}: WidgetSettingsPanelProps & {
    readonly note?: string | undefined;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(commonMessages.updateSection)}>
            <SelectSetting
                label={t(commonMessages.pollingFrequencyLabel)}
                value={context.resolved.preferences.pollingFrequencySeconds}
                optionList={pollingFrequencyOptionList}
                onValueChange={(pollingFrequencySeconds) => onSettingsPatch({
                    preferences: { pollingFrequencySeconds },
                })}
            />
            {note !== undefined && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{note}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

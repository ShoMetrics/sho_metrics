import { commonMessages } from "../../../i18n/message-groups/shell";
import { useI18n } from "../../../i18n/react";
import { InspectorItem } from "../../components/InspectorItem";
import { SelectSetting } from "../../controls/SelectSetting";
import type { SelectOption } from "../../inspector/types";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "../panel-props";
import { buildPollingFrequencyOptionList } from "../setting-options";

export function PollingSettings({
    context,
    onSettingsPatch,
    note,
    optionList,
}: WidgetSettingsPanelProps & {
    readonly note?: string | undefined;
    readonly optionList?: readonly SelectOption<number>[] | undefined;
}): React.JSX.Element {
    const { t } = useI18n();
    const resolvedOptionList = optionList ?? buildPollingFrequencyOptionList(t);

    return (
        <SettingsSection title={t(commonMessages.updateSection)}>
            <SelectSetting
                label={t(commonMessages.pollingFrequencyLabel)}
                value={context.resolved.preferences.pollingFrequencySeconds}
                optionList={resolvedOptionList}
                onValueChange={(pollingFrequencySeconds) => onSettingsPatch({
                    preferences: { pollingFrequencySeconds },
                })}
            />
            {note !== undefined && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{renderNoteText(note)}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function renderNoteText(note: string): React.ReactNode {
    const lines = note.split("\n");
    return lines.map((line, index) => (
        <span key={index}>
            {index === 0 ? undefined : <br />}
            {line}
        </span>
    ));
}

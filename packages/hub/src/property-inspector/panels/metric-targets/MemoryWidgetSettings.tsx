import { optionMessages } from "../../../i18n/message-groups/options";
import { localizeOptionList } from "../../../i18n/options";
import { useI18n } from "../../../i18n/react";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedMemoryMetricTarget,
} from "../../../settings/resolved-settings";
import { SelectSetting } from "../../controls/SelectSetting";
import { StandardColorSettings } from "../controls/ColorSettings";
import { AppearanceSettings } from "../controls/AppearanceSettings";
import { LineSettings } from "../controls/LineSettings";
import { PollingSettings } from "../controls/PollingSettings";
import { SettingsSection } from "../controls/SettingsSection";
import type { WidgetSettingsPanelProps } from "../panel-props";
import { isCapacityDisplayModeVisible, memoryUsageDisplayModeOptionList } from "../setting-options";
import { commonMessages } from "../../../i18n/message-groups/shell";

type MemoryWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedMemoryMetricTarget;
};

export function MemoryWidgetSettings(props: MemoryWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const view = requireResolvedSingleMetricWidget(props.context.resolved).slot.appearance.view;
    const shouldShowDisplayMode = isCapacityDisplayModeVisible(view);

    return (
        <>
            {shouldShowDisplayMode && (
                <SettingsSection title={t(commonMessages.metricSection)}>
                    <SelectSetting
                        label={t(commonMessages.usageDisplayLabel)}
                        value={props.target.reading.displayMode}
                        optionList={localizeOptionList(
                            t,
                            memoryUsageDisplayModeOptionList,
                            memoryUsageDisplayModeMessageByValue,
                        )}
                        onValueChange={(usageDisplayMode) => props.onSettingsPatch({
                            memory: { usageDisplayMode },
                        })}
                    />
                </SettingsSection>
            )}
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}

const memoryUsageDisplayModeMessageByValue = {
    usedPercentage: optionMessages.percentageOption,
    usedCapacity: optionMessages.usedMemoryOption,
    freeCapacity: optionMessages.freeMemoryOption,
} as const;

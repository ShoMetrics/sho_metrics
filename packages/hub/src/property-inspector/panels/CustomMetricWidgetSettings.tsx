import {
    useState,
} from "react";
import { customMetricMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import { InspectorItem } from "../components/InspectorItem";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import { customHttpPollingFrequencyOptionList } from "./setting-options";
import { CustomMetricIconSettings } from "./custom-metric/CustomMetricIconSettings";
import { CustomMetricSourceEditorPanel } from "./custom-metric/CustomMetricSourceEditorPanel";
import type {
    CustomMetricWidgetSettingsProps,
} from "./custom-metric/types";

export function CustomMetricWidgetSettings(props: CustomMetricWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const [isEditingSource, setIsEditingSource] = useState(false);

    if (isEditingSource) {
        return (
            <CustomMetricSourceEditorPanel
                {...props}
                onBack={() => setIsEditingSource(false)}
            />
        );
    }

    return (
        <>
            <SettingsSection title={t(customMetricMessages.sourceSection)}>
                <InspectorItem label={t(customMetricMessages.sourceSummaryLabel)}>
                    <div className="advanced-action-stack">
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={() => setIsEditingSource(true)}
                        >
                            {t(customMetricMessages.editSourceButton)}
                        </button>
                        <p className="section-note">
                            {props.target.configuration.state === "configured"
                                ? t(customMetricMessages.sourceConfiguredSummary)
                                : t(customMetricMessages.sourceNeedsSetupSummary)}
                        </p>
                    </div>
                </InspectorItem>
            </SettingsSection>
            {props.target.configuration.state === "configured" && (
                <CustomMetricIconSettings
                    iconId={props.target.iconId}
                    onIconIdChange={(iconId) => props.onSettingsPatch({
                        customMetric: { iconId },
                    })}
                />
            )}
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            {props.showPolling !== false && (
                <PollingSettings
                    {...props}
                    optionList={customHttpPollingFrequencyOptionList}
                />
            )}
        </>
    );
}

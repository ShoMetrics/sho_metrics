import {
    useState,
} from "react";
import { customMetricMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import {
    METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS,
    normalizeMetricCustomLabelInput,
    resolveMetricCustomLabelDisplayMaximumCharacters,
    resolveMetricCustomLabelKeyShape,
} from "../../settings/metric-custom-label-policy";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import { InspectorItem } from "../components/InspectorItem";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import { customHttpPollingFrequencyOptionList } from "./setting-options";
import { MetricCustomizationSettings } from "./MetricCustomizationSettings";
import { CustomMetricSourceEditorPanel } from "./custom-metric/CustomMetricSourceEditorPanel";
import type {
    CustomMetricWidgetSettingsProps,
} from "./custom-metric/types";

export function CustomMetricWidgetSettings(props: CustomMetricWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const [isEditingSource, setIsEditingSource] = useState(false);
    const widget = requireResolvedSingleMetricWidget(props.context.resolved);
    const viewSettings = widget.slot.appearance.view;
    const displayMaximumLabelCharacters = resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings,
        selectedTheme: widget.slot.appearance.theme.selectedTheme,
        keyShape: resolveMetricCustomLabelKeyShape({
            selectedView: viewSettings.selectedView,
            isTouchStrip: props.context.isTouchStrip,
        }),
    });

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
                <MetricCustomizationSettings
                    label={{
                        value: props.target.customLabel,
                        placeholder: t(customMetricMessages.customLabelPlaceholder),
                        inputMaximumCharacters: METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS,
                        displayMaximumCharacters: displayMaximumLabelCharacters,
                        onValueChange: (customLabel) => props.onSettingsPatch({
                            customMetric: { customLabel: normalizeMetricCustomLabelInput(customLabel) },
                        }),
                    }}
                    icon={{
                        iconId: props.target.customIconId,
                        onIconIdChange: (customIconId) => props.onSettingsPatch({
                            customMetric: { customIconId },
                        }),
                    }}
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

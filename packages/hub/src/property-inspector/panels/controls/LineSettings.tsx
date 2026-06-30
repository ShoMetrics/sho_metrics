import { InspectorItem } from "../../components/InspectorItem";
import { SectionHeading } from "../../components/SectionHeading";
import { colorMessages } from "../../../i18n/message-groups/color";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { networkMessages } from "../../../i18n/message-groups/widgets";
import { optionMessages } from "../../../i18n/message-groups/options";
import { localizeOptionList } from "../../../i18n/options";
import { useI18n } from "../../../i18n/react";
import { RangeSetting } from "../../controls/RangeSetting";
import { SelectSetting } from "../../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import { requireResolvedSingleMetricWidget } from "../../../settings/resolved-settings";
import type { WidgetSettingsPanelProps } from "../panel-props";
import {
    disabledGridLineVisibilityOptionList,
    gridLineTypeOptionList,
    gridLineVisibilityOptionList,
    networkTrafficDisplayModeOptionList,
} from "../setting-options";

export function LineSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element | null {
    const { t } = useI18n();
    const slot = requireResolvedSingleMetricWidget(context.resolved).slot;
    const appearance = slot.appearance;
    const target = slot.metric.target;

    if (appearance.view.selectedView !== "line") {
        return null;
    }

    const isNetworkBoth = target.domain === "network"
        && target.reading.kind === "traffic"
        && target.reading.direction === "both";
    const isMirroredNetworkTraffic = isNetworkBoth
        && target.reading.trafficDisplayMode === "mirrored";

    return (
        <SettingsSection title={t(commonMessages.trendSection)}>
            {isNetworkBoth && (
                <SelectSetting
                    label={t(networkMessages.trafficModeLabel)}
                    value={target.reading.trafficDisplayMode}
                    optionList={localizeOptionList(t, networkTrafficDisplayModeOptionList, networkTrafficDisplayModeMessageByValue)}
                    onValueChange={(trafficDisplayMode) => onSettingsPatch({
                        network: { trafficDisplayMode },
                    })}
                />
            )}
            <SectionHeading text={t(colorMessages.visualGuidesHeading)} />
            <RangeSetting
                label={t(networkMessages.trendLineSmoothingLabel)}
                value={appearance.line.lineSmoothingPercent}
                minimum={0}
                maximum={100}
                step={5}
                onValueChange={(lineSmoothingPercent) => onSettingsPatch({
                    appearance: { line: { lineSmoothingPercent } },
                })}
            />
            {isMirroredNetworkTraffic ? (
                <>
                    <SelectSetting
                        label={t(networkMessages.gridLineVisibilityLabel)}
                        value="none"
                        optionList={localizeOptionList(t, disabledGridLineVisibilityOptionList, gridLineVisibilityMessageByValue)}
                        onValueChange={(gridLineVisibility) => onSettingsPatch({
                            appearance: { line: { gridLineVisibility } },
                        })}
                        disabled
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">{t(networkMessages.mirroredTrafficGridUnsupportedNote)}</p>
                    </InspectorItem>
                    <SelectSetting
                        label={t(networkMessages.gridLineTypeLabel)}
                        value={appearance.line.gridLineType}
                        optionList={localizeOptionList(t, gridLineTypeOptionList, gridLineTypeMessageByValue)}
                        onValueChange={(gridLineType) => onSettingsPatch({
                            appearance: { line: { gridLineType } },
                        })}
                        disabled
                    />
                </>
            ) : (
                <>
                    <SelectSetting
                        label={t(networkMessages.gridLineVisibilityLabel)}
                        value={appearance.line.gridLineVisibility}
                        optionList={localizeOptionList(t, gridLineVisibilityOptionList, gridLineVisibilityMessageByValue)}
                        onValueChange={(gridLineVisibility) => onSettingsPatch({
                            appearance: { line: { gridLineVisibility } },
                        })}
                    />
                    <SelectSetting
                        label={t(networkMessages.gridLineTypeLabel)}
                        value={appearance.line.gridLineType}
                        optionList={localizeOptionList(t, gridLineTypeOptionList, gridLineTypeMessageByValue)}
                        onValueChange={(gridLineType) => onSettingsPatch({
                            appearance: { line: { gridLineType } },
                        })}
                        disabled={appearance.line.gridLineVisibility === "none"}
                    />
                </>
            )}
        </SettingsSection>
    );
}

const networkTrafficDisplayModeMessageByValue = {
    overlay: optionMessages.overlayOption,
    mirrored: optionMessages.mirroredOption,
} as const;

const gridLineVisibilityMessageByValue = {
    adaptive: optionMessages.adaptiveToActivityOption,
    always: optionMessages.alwaysOption,
    none: optionMessages.noneOption,
} as const;

const gridLineTypeMessageByValue = {
    horizontal: optionMessages.horizontalOption,
    vertical: optionMessages.verticalOption,
} as const;

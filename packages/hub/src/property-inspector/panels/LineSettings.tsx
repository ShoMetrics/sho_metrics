import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { RangeSetting } from "../controls/RangeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    disabledGridLineVisibilityOptionList,
    gridLineTypeOptionList,
    gridLineVisibilityOptionList,
    networkTrafficDisplayModeOptionList,
} from "./setting-options";

export function LineSettings({
    context,
    onSettingsPatch,
}: WidgetSettingsPanelProps): React.JSX.Element | null {
    const appearance = context.resolved.widget.slot.appearance;
    const target = context.resolved.widget.slot.metric.target;

    if (appearance.view.selectedView !== "line") {
        return null;
    }

    const isNetworkBoth = target.domain === "network"
        && target.reading.kind === "traffic"
        && target.reading.direction === "both";
    const isMirroredNetworkTraffic = isNetworkBoth
        && target.reading.trafficDisplayMode === "mirrored";

    return (
        <SettingsSection title="Trend">
            {isNetworkBoth && (
                <SelectSetting
                    label="Traffic Mode"
                    value={target.reading.trafficDisplayMode}
                    optionList={networkTrafficDisplayModeOptionList}
                    onValueChange={(trafficDisplayMode) => onSettingsPatch({
                        network: { trafficDisplayMode },
                    })}
                />
            )}
            <SectionHeading text="Visual Guides" />
            <RangeSetting
                label="Trend Line Smoothing"
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
                        label="Grid Line Visibility"
                        value="none"
                        optionList={disabledGridLineVisibilityOptionList}
                        onValueChange={(gridLineVisibility) => onSettingsPatch({
                            appearance: { line: { gridLineVisibility } },
                        })}
                        disabled
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Grid line settings are not supported in mirrored traffic mode.</p>
                    </InspectorItem>
                    <SelectSetting
                        label="Grid Line Type"
                        value={appearance.line.gridLineType}
                        optionList={gridLineTypeOptionList}
                        onValueChange={(gridLineType) => onSettingsPatch({
                            appearance: { line: { gridLineType } },
                        })}
                        disabled
                    />
                </>
            ) : (
                <>
                    <SelectSetting
                        label="Grid Line Visibility"
                        value={appearance.line.gridLineVisibility}
                        optionList={gridLineVisibilityOptionList}
                        onValueChange={(gridLineVisibility) => onSettingsPatch({
                            appearance: { line: { gridLineVisibility } },
                        })}
                    />
                    <SelectSetting
                        label="Grid Line Type"
                        value={appearance.line.gridLineType}
                        optionList={gridLineTypeOptionList}
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

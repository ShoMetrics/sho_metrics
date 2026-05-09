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

export function SparklineSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element | null {
    if (context.resolved.appearance.graphicType !== "dashed-line") {
        return null;
    }

    const isMirroredNetworkTraffic = context.actionKind === "net-speed"
        && context.resolved.metric.networkDirection === "both"
        && context.resolved.local.networkTrafficDisplayMode === "mirrored";

    return (
        <SettingsSection title="Trend">
            {context.actionKind === "net-speed" && context.resolved.metric.networkDirection === "both" && (
                <SelectSetting
                    label="Traffic Graph"
                    value={context.resolved.local.networkTrafficDisplayMode}
                    optionList={networkTrafficDisplayModeOptionList}
                    onValueChange={(value) => onSettingChange("networkTrafficDisplayMode", value)}
                />
            )}
            <SectionHeading text="Visual Guides" />
            <RangeSetting
                label="Trend Line Smoothing"
                value={context.resolved.appearance.lineSmoothingPercent}
                minimum={0}
                maximum={100}
                step={5}
                onValueChange={(value) => onSettingChange("lineSmoothingPercent", value)}
            />
            {isMirroredNetworkTraffic ? (
                <>
                    <SelectSetting
                        label="Grid Line Visibility"
                        value="none"
                        optionList={disabledGridLineVisibilityOptionList}
                        onValueChange={(value) => onSettingChange("gridLineVisibility", value)}
                        disabled
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Grid line settings are not supported in mirrored Traffic Graph.</p>
                    </InspectorItem>
                    <SelectSetting
                        label="Grid Line Type"
                        value={context.resolved.appearance.gridLineType}
                        optionList={gridLineTypeOptionList}
                        onValueChange={(value) => onSettingChange("gridLineType", value)}
                        disabled
                    />
                </>
            ) : (
                <>
                    <SelectSetting
                        label="Grid Line Visibility"
                        value={context.resolved.appearance.gridLineVisibility}
                        optionList={gridLineVisibilityOptionList}
                        onValueChange={(value) => onSettingChange("gridLineVisibility", value)}
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Adaptive: grid line visibility adapts to chart activity.</p>
                    </InspectorItem>
                    <SelectSetting
                        label="Grid Line Type"
                        value={context.resolved.appearance.gridLineType}
                        optionList={gridLineTypeOptionList}
                        onValueChange={(value) => onSettingChange("gridLineType", value)}
                        disabled={context.resolved.appearance.gridLineVisibility === "none"}
                    />
                </>
            )}
        </SettingsSection>
    );
}

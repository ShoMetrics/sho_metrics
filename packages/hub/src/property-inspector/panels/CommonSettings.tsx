import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { CircleStyleSetting } from "../controls/CircleStyleSetting";
import { ColorBandSetting } from "../controls/ColorBandSetting";
import { ColorSetting } from "../controls/ColorSetting";
import { GraphicTypeSetting } from "../controls/GraphicTypeSetting";
import { RangeSetting } from "../controls/RangeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { appearanceColorTarget } from "../controls/appearance-color-target";
import type { InspectorSettingTarget, VisibilityContext } from "../schema";
import { SettingsSection } from "./SettingsSection";
import {
    colorModeOptionList,
    disabledGridLineVisibilityOptionList,
    graphicStyleOptionList,
    gridLineTypeOptionList,
    gridLineVisibilityOptionList,
    networkTrafficDisplayModeOptionList,
    pollingFrequencyOptionList,
} from "./setting-options";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
    appearanceDisabled?: boolean;
}

export function LayoutSettings({
    context,
    onSettingChange,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Layout">
            <GraphicTypeSetting
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <SelectSetting
                target="graphicStyle"
                label="Graphic Style"
                optionList={graphicStyleOptionList}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            {context.resolved.appearance.graphicType === "circular" && (
                <CircleStyleSetting
                    context={context}
                    onSettingChange={onSettingChange}
                    disabled={appearanceDisabled}
                />
            )}
        </SettingsSection>
    );
}

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
                    target="networkTrafficDisplayMode"
                    label="Traffic Graph"
                    optionList={networkTrafficDisplayModeOptionList}
                    context={context}
                    onSettingChange={onSettingChange}
                />
            )}
            <SectionHeading text="Visual Guides" />
            <RangeSetting
                target="lineSmoothingPercent"
                label="Trend Line Smoothing"
                minimum={0}
                maximum={100}
                step={5}
                context={context}
                onSettingChange={onSettingChange}
            />
            {isMirroredNetworkTraffic ? (
                <>
                    <SelectSetting
                        target="gridLineVisibility"
                        label="Grid Line Visibility"
                        optionList={disabledGridLineVisibilityOptionList}
                        context={context}
                        onSettingChange={onSettingChange}
                        disabled
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Grid line settings are not supported in mirrored Traffic Graph.</p>
                    </InspectorItem>
                    <SelectSetting
                        target="gridLineType"
                        label="Grid Line Type"
                        optionList={gridLineTypeOptionList}
                        context={context}
                        onSettingChange={onSettingChange}
                        disabled
                    />
                </>
            ) : (
                <>
                    <SelectSetting
                        target="gridLineVisibility"
                        label="Grid Line Visibility"
                        optionList={gridLineVisibilityOptionList}
                        context={context}
                        onSettingChange={onSettingChange}
                    />
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Adaptive: grid line visibility adapts to chart activity.</p>
                    </InspectorItem>
                    <SelectSetting
                        target="gridLineType"
                        label="Grid Line Type"
                        optionList={gridLineTypeOptionList}
                        context={context}
                        onSettingChange={onSettingChange}
                        disabled={context.resolved.appearance.gridLineVisibility === "none"}
                    />
                </>
            )}
        </SettingsSection>
    );
}

export function StandardColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context, onSettingChange, appearanceDisabled = false } = props;
    const isSolidColor = context.resolved.appearance.colorMode === "solid";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            {isSolidColor ? (
                <ColorSetting
                    target={appearanceColorTarget("usageColors", "solidColor")}
                    label="Solid Color"
                    context={context}
                    onSettingChange={onSettingChange}
                    disabled={appearanceDisabled}
                />
            ) : (
                <ThresholdColorSettings {...props} />
            )}
        </SettingsSection>
    );
}

export function NetworkChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <ChannelThresholdControls {...props} />
            <NetworkDownloadColorSettings {...props} />
            <NetworkUploadColorSettings {...props} />
        </SettingsSection>
    );
}

export function DiskThroughputChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <ChannelThresholdControls {...props} />
            <DiskReadColorSettings {...props} />
            <DiskWriteColorSettings {...props} />
        </SettingsSection>
    );
}

export function PollingSettings({
    context,
    onSettingChange,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SettingsSection title="Update">
            <SelectSetting
                target="pollingFrequencySeconds"
                label="Polling Frequency"
                optionList={pollingFrequencyOptionList}
                context={context}
                onSettingChange={onSettingChange}
            />
        </SettingsSection>
    );
}

export function usesNetworkChannelColorSettings(context: VisibilityContext): boolean {
    return context.actionKind === "net-speed"
        && context.resolved.metric.networkDirection === "both";
}

export function usesDiskThroughputChannelColorSettings(context: VisibilityContext): boolean {
    return context.actionKind === "disk"
        && context.resolved.metric.diskMetricKind === "throughput"
        && context.resolved.metric.diskThroughputDirection === "both"
        && context.resolved.appearance.graphicType !== "linear";
}

function ColorModeSetting({
    context,
    onSettingChange,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SelectSetting
            target="colorMode"
            label="Color Mode"
            optionList={colorModeOptionList}
            context={context}
            onSettingChange={onSettingChange}
            disabled={appearanceDisabled}
        />
    );
}

function ThresholdColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context, onSettingChange, appearanceDisabled = false } = props;
    const lowThreshold = context.resolved.appearance.lowThreshold;
    const highThreshold = context.resolved.appearance.highThreshold;

    return (
        <>
            <InspectorItem className="note-item note-item-default">
                <p className="section-note">Set the usage ranges that choose low, medium, or high color.</p>
            </InspectorItem>
            <ThresholdRangeSettings {...props} />
            <ColorBandSetting
                target={appearanceColorTarget("usageColors", "lowColor")}
                label="Low Usage Color"
                bandText={`0-${lowThreshold}%`}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <ColorBandSetting
                target={appearanceColorTarget("usageColors", "mediumColor")}
                label="Medium Usage Color"
                bandText={`${lowThreshold}-${highThreshold}%`}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <ColorBandSetting
                target={appearanceColorTarget("usageColors", "highColor")}
                label="High Usage Color"
                bandText={`${highThreshold}-100%`}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
        </>
    );
}

function ChannelThresholdControls(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    if (props.context.resolved.appearance.colorMode !== "threshold") {
        return null;
    }

    return <ThresholdRangeSettings {...props} />;
}

function ThresholdRangeSettings({
    context,
    onSettingChange,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <RangeSetting
                target="lowThreshold"
                label="Low Ends At"
                minimum={0}
                maximum={100}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <RangeSetting
                target="highThreshold"
                label="High Starts At"
                minimum={0}
                maximum={100}
                step={1}
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
        </>
    );
}

function NetworkDownloadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Color - Download" />
            <ChannelColorFields
                {...props}
                rampKey="downloadColors"
            />
        </>
    );
}

function NetworkUploadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Color - Upload" />
            <ChannelColorFields
                {...props}
                rampKey="uploadColors"
            />
        </>
    );
}

function DiskReadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Read" />
            <ChannelColorFields
                {...props}
                rampKey="diskReadColors"
            />
        </>
    );
}

function DiskWriteColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Write" />
            <ChannelColorFields
                {...props}
                rampKey="diskWriteColors"
            />
        </>
    );
}

function ChannelColorFields({
    rampKey,
    context,
    onSettingChange,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps & {
    rampKey: "downloadColors" | "uploadColors" | "diskReadColors" | "diskWriteColors";
}): React.JSX.Element {
    if (context.resolved.appearance.colorMode !== "threshold") {
        return (
            <ColorSetting
                target={appearanceColorTarget(rampKey, "solidColor")}
                label="Solid Color"
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                target={appearanceColorTarget(rampKey, "lowColor")}
                label="Low Color"
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <ColorSetting
                target={appearanceColorTarget(rampKey, "mediumColor")}
                label="Medium Color"
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
            <ColorSetting
                target={appearanceColorTarget(rampKey, "highColor")}
                label="High Color"
                context={context}
                onSettingChange={onSettingChange}
                disabled={appearanceDisabled}
            />
        </>
    );
}

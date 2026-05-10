import type { AppearanceColorRampKey, ColorRamp } from "../../settings/widget-settings";
import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { ColorBandSetting } from "../controls/ColorBandSetting";
import { ColorSetting } from "../controls/ColorSetting";
import { RangeSetting } from "../controls/RangeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { VisibilityContext } from "../inspector/types";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { colorModeOptionList } from "./setting-options";

export function StandardColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context, appearanceDisabled = false } = props;
    const isSolidColor = context.resolved.appearance.colorMode === "solid";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            {isSolidColor ? (
                <ColorSetting
                    label="Solid Color"
                    value={readAppearanceColor(context, "usageColors", "solidColor")}
                    onValueChange={writeAppearanceColor(props, "usageColors", "solidColor")}
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
    onSettingsPatch,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SelectSetting
            label="Color Mode"
            value={context.resolved.appearance.colorMode}
            optionList={colorModeOptionList}
            onValueChange={(colorMode) => onSettingsPatch({
                appearanceOverrides: { colorMode },
            })}
            disabled={appearanceDisabled}
        />
    );
}

function ThresholdColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context, appearanceDisabled = false } = props;
    const lowThreshold = context.resolved.appearance.lowThreshold;
    const highThreshold = context.resolved.appearance.highThreshold;

    return (
        <>
            <InspectorItem className="note-item note-item-default">
                <p className="section-note">Set the usage ranges that choose low, medium, or high color.</p>
            </InspectorItem>
            <ThresholdRangeSettings {...props} />
            <ColorBandSetting
                label="Low Usage Color"
                value={readAppearanceColor(context, "usageColors", "lowColor")}
                onValueChange={writeAppearanceColor(props, "usageColors", "lowColor")}
                bandText={`0-${lowThreshold}%`}
                disabled={appearanceDisabled}
            />
            <ColorBandSetting
                label="Medium Usage Color"
                value={readAppearanceColor(context, "usageColors", "mediumColor")}
                onValueChange={writeAppearanceColor(props, "usageColors", "mediumColor")}
                bandText={`${lowThreshold}-${highThreshold}%`}
                disabled={appearanceDisabled}
            />
            <ColorBandSetting
                label="High Usage Color"
                value={readAppearanceColor(context, "usageColors", "highColor")}
                onValueChange={writeAppearanceColor(props, "usageColors", "highColor")}
                bandText={`${highThreshold}-100%`}
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
    onSettingsPatch,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <RangeSetting
                label="Low Ends At"
                value={context.resolved.appearance.lowThreshold}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(lowThreshold) => {
                    const patch = lowThreshold > context.resolved.appearance.highThreshold
                        ? { lowThreshold, highThreshold: lowThreshold }
                        : { lowThreshold };

                    onSettingsPatch({ appearanceOverrides: patch });
                }}
                disabled={appearanceDisabled}
            />
            <RangeSetting
                label="High Starts At"
                value={context.resolved.appearance.highThreshold}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(highThreshold) => {
                    const patch = highThreshold < context.resolved.appearance.lowThreshold
                        ? { lowThreshold: highThreshold, highThreshold }
                        : { highThreshold };

                    onSettingsPatch({ appearanceOverrides: patch });
                }}
                disabled={appearanceDisabled}
            />
        </>
    );
}

function NetworkDownloadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Color - Download" />
            <ChannelColorFields {...props} rampKey="downloadColors" />
        </>
    );
}

function NetworkUploadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Color - Upload" />
            <ChannelColorFields {...props} rampKey="uploadColors" />
        </>
    );
}

function DiskReadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Read" />
            <ChannelColorFields {...props} rampKey="diskReadColors" />
        </>
    );
}

function DiskWriteColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Write" />
            <ChannelColorFields {...props} rampKey="diskWriteColors" />
        </>
    );
}

function ChannelColorFields({
    rampKey,
    context,
    onSettingsPatch,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps & {
    rampKey: "downloadColors" | "uploadColors" | "diskReadColors" | "diskWriteColors";
}): React.JSX.Element {
    const props = { onSettingsPatch };

    if (context.resolved.appearance.colorMode !== "threshold") {
        return (
            <ColorSetting
                label="Solid Color"
                value={readAppearanceColor(context, rampKey, "solidColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "solidColor")}
                disabled={appearanceDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                label="Low Color"
                value={readAppearanceColor(context, rampKey, "lowColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "lowColor")}
                disabled={appearanceDisabled}
            />
            <ColorSetting
                label="Medium Color"
                value={readAppearanceColor(context, rampKey, "mediumColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "mediumColor")}
                disabled={appearanceDisabled}
            />
            <ColorSetting
                label="High Color"
                value={readAppearanceColor(context, rampKey, "highColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "highColor")}
                disabled={appearanceDisabled}
            />
        </>
    );
}

function readAppearanceColor(
    context: VisibilityContext,
    rampKey: AppearanceColorRampKey,
    colorKey: keyof ColorRamp,
): string {
    return context.resolved.appearance[rampKey][colorKey];
}

function writeAppearanceColor(
    props: Pick<WidgetSettingsPanelProps, "onSettingsPatch">,
    rampKey: AppearanceColorRampKey,
    colorKey: keyof ColorRamp,
): (value: string) => void {
    return (value) => props.onSettingsPatch({
        appearanceOverrides: {
            [rampKey]: {
                [colorKey]: value,
            },
        },
    });
}

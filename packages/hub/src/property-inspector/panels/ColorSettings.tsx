import type { ResolvedColorRamp } from "../../settings/resolved-settings";
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
    const isSolidColor = context.resolved.widget.slot.appearance.colorMode === "solid";

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

function ColorModeSetting({
    context,
    onSettingsPatch,
    appearanceDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SelectSetting
            label="Color Mode"
            value={context.resolved.widget.slot.appearance.colorMode}
            optionList={colorModeOptionList}
            onValueChange={(colorMode) => onSettingsPatch({
                appearance: { colorMode },
            })}
            disabled={appearanceDisabled}
        />
    );
}

function ThresholdColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context, appearanceDisabled = false } = props;
    const lowThreshold = context.resolved.widget.slot.appearance.lowColorThresholdPercent;
    const highThreshold = context.resolved.widget.slot.appearance.highColorThresholdPercent;

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
    if (props.context.resolved.widget.slot.appearance.colorMode !== "threshold") {
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
                value={context.resolved.widget.slot.appearance.lowColorThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(lowColorThresholdPercent) => {
                    const highThreshold = context.resolved.widget.slot.appearance.highColorThresholdPercent;
                    const patch = lowColorThresholdPercent > highThreshold
                        ? {
                            lowColorThresholdPercent,
                            highColorThresholdPercent: lowColorThresholdPercent,
                        }
                        : { lowColorThresholdPercent };

                    onSettingsPatch({ appearance: patch });
                }}
                disabled={appearanceDisabled}
            />
            <RangeSetting
                label="High Starts At"
                value={context.resolved.widget.slot.appearance.highColorThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(highColorThresholdPercent) => {
                    const lowThreshold = context.resolved.widget.slot.appearance.lowColorThresholdPercent;
                    const patch = highColorThresholdPercent < lowThreshold
                        ? {
                            lowColorThresholdPercent: highColorThresholdPercent,
                            highColorThresholdPercent,
                        }
                        : { highColorThresholdPercent };

                    onSettingsPatch({ appearance: patch });
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

    if (context.resolved.widget.slot.appearance.colorMode !== "threshold") {
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
    rampKey: ColorRampKey,
    colorKey: keyof ResolvedColorRamp,
): string {
    return context.resolved.widget.slot.appearance[rampKey][colorKey];
}

function writeAppearanceColor(
    props: Pick<WidgetSettingsPanelProps, "onSettingsPatch">,
    rampKey: ColorRampKey,
    colorKey: keyof ResolvedColorRamp,
): (value: string) => void {
    return (value) => props.onSettingsPatch({
        appearance: {
            [rampKey]: {
                [colorKey]: value,
            },
        },
    });
}

type ColorRampKey =
    | "usageColors"
    | "downloadColors"
    | "uploadColors"
    | "diskReadColors"
    | "diskWriteColors";

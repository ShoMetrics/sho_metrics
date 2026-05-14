import type {
    ColorMode,
    ResolvedAppearanceSettings,
    ResolvedColorRamp,
} from "../../settings/resolved-settings";
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
    const { context, colorDisabled = false } = props;
    const appearance = context.resolved.widget.slot.appearance;

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorRampSettings
                colorMode={appearance.colorMode}
                colors={appearance.usageColors}
                lowColorThresholdPercent={appearance.lowColorThresholdPercent}
                highColorThresholdPercent={appearance.highColorThresholdPercent}
                onColorModeChange={(colorMode) => props.onSettingsPatch({
                    appearance: { colorMode },
                })}
                onColorRampPatch={(usageColors) => props.onSettingsPatch({
                    appearance: { usageColors },
                })}
                onThresholdPatch={(appearancePatch) => props.onSettingsPatch({
                    appearance: appearancePatch,
                })}
                disabled={colorDisabled}
            />
        </SettingsSection>
    );
}

interface ColorRampSettingsProps {
    readonly colorMode: ColorMode;
    readonly colors: ResolvedColorRamp;
    readonly lowColorThresholdPercent: number;
    readonly highColorThresholdPercent: number;
    readonly onColorModeChange: (colorMode: ColorMode) => void;
    readonly onColorRampPatch: (patch: Partial<ResolvedColorRamp>) => void;
    readonly onThresholdPatch: (patch: ColorThresholdPatch) => void;
    readonly disabled?: boolean | undefined;
}

export function ColorRampSettings({
    colorMode,
    colors,
    lowColorThresholdPercent,
    highColorThresholdPercent,
    onColorModeChange,
    onColorRampPatch,
    onThresholdPatch,
    disabled = false,
}: ColorRampSettingsProps): React.JSX.Element {
    return (
        <>
            <SelectSetting
                label="Color Mode"
                value={colorMode}
                optionList={colorModeOptionList}
                onValueChange={onColorModeChange}
                disabled={disabled}
            />
            {colorMode === "black-white" ? null : colorMode === "solid" ? (
                <ColorSetting
                    label="Solid Color"
                    value={colors.solidColor}
                    onValueChange={(solidColor) => onColorRampPatch({ solidColor })}
                    disabled={disabled}
                />
            ) : (
                <ThresholdColorSettings
                    colors={colors}
                    lowColorThresholdPercent={lowColorThresholdPercent}
                    highColorThresholdPercent={highColorThresholdPercent}
                    onColorRampPatch={onColorRampPatch}
                    onThresholdPatch={onThresholdPatch}
                    disabled={disabled}
                />
            )}
        </>
    );
}

export function NetworkChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const shouldShowChannelColors = props.context.resolved.widget.slot.appearance.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <ChannelThresholdControls {...props} />
            {shouldShowChannelColors ? (
                <>
                    <NetworkDownloadColorSettings {...props} />
                    <NetworkUploadColorSettings {...props} />
                </>
            ) : null}
        </SettingsSection>
    );
}

export function DiskThroughputChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const shouldShowChannelColors = props.context.resolved.widget.slot.appearance.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <ChannelThresholdControls {...props} />
            {shouldShowChannelColors ? (
                <>
                    <DiskReadColorSettings {...props} />
                    <DiskWriteColorSettings {...props} />
                </>
            ) : null}
        </SettingsSection>
    );
}

function ColorModeSetting({
    context,
    onSettingsPatch,
    colorDisabled = false,
}: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <SelectSetting
            label="Color Mode"
            value={context.resolved.widget.slot.appearance.colorMode}
            optionList={colorModeOptionList}
            onValueChange={(colorMode) => onSettingsPatch({
                appearance: { colorMode },
            })}
            disabled={colorDisabled}
        />
    );
}

function ThresholdColorSettings({
    colors,
    lowColorThresholdPercent,
    highColorThresholdPercent,
    onColorRampPatch,
    onThresholdPatch,
    disabled = false,
}: {
    readonly colors: ResolvedColorRamp;
    readonly lowColorThresholdPercent: number;
    readonly highColorThresholdPercent: number;
    readonly onColorRampPatch: (patch: Partial<ResolvedColorRamp>) => void;
    readonly onThresholdPatch: (patch: ColorThresholdPatch) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <InspectorItem className="note-item note-item-default">
                <p className="section-note">Set the percentage ranges that choose low, medium, or high color.</p>
            </InspectorItem>
            <ThresholdRangeSettings
                lowColorThresholdPercent={lowColorThresholdPercent}
                highColorThresholdPercent={highColorThresholdPercent}
                onThresholdPatch={onThresholdPatch}
                disabled={disabled}
            />
            <ColorBandSetting
                label="Low Color"
                value={colors.lowColor}
                onValueChange={(lowColor) => onColorRampPatch({ lowColor })}
                bandText={`0-${lowColorThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label="Medium Color"
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onColorRampPatch({ mediumColor })}
                bandText={`${lowColorThresholdPercent}-${highColorThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label="High Color"
                value={colors.highColor}
                onValueChange={(highColor) => onColorRampPatch({ highColor })}
                bandText={`${highColorThresholdPercent}-100%`}
                disabled={disabled}
            />
        </>
    );
}

function ChannelThresholdControls(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    const appearance = props.context.resolved.widget.slot.appearance;

    if (appearance.colorMode !== "threshold") {
        return null;
    }

    return (
        <ThresholdRangeSettings
            lowColorThresholdPercent={appearance.lowColorThresholdPercent}
            highColorThresholdPercent={appearance.highColorThresholdPercent}
            onThresholdPatch={(appearancePatch) => props.onSettingsPatch({
                appearance: appearancePatch,
            })}
            disabled={props.colorDisabled}
        />
    );
}

function ThresholdRangeSettings({
    lowColorThresholdPercent,
    highColorThresholdPercent,
    onThresholdPatch,
    disabled = false,
}: {
    readonly lowColorThresholdPercent: number;
    readonly highColorThresholdPercent: number;
    readonly onThresholdPatch: (patch: ColorThresholdPatch) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <RangeSetting
                label="Low Ends At"
                value={lowColorThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(lowColorThresholdPercent) => {
                    const patch = lowColorThresholdPercent > highColorThresholdPercent
                        ? {
                            lowColorThresholdPercent,
                            highColorThresholdPercent: lowColorThresholdPercent,
                        }
                        : { lowColorThresholdPercent };

                    onThresholdPatch(patch);
                }}
                disabled={disabled}
            />
            <RangeSetting
                label="High Starts At"
                value={highColorThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(highColorThresholdPercent) => {
                    const patch = highColorThresholdPercent < lowColorThresholdPercent
                        ? {
                            lowColorThresholdPercent: highColorThresholdPercent,
                            highColorThresholdPercent,
                        }
                        : { highColorThresholdPercent };

                    onThresholdPatch(patch);
                }}
                disabled={disabled}
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
    colorDisabled = false,
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
                disabled={colorDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                label="Low Color"
                value={readAppearanceColor(context, rampKey, "lowColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "lowColor")}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="Medium Color"
                value={readAppearanceColor(context, rampKey, "mediumColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "mediumColor")}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="High Color"
                value={readAppearanceColor(context, rampKey, "highColor")}
                onValueChange={writeAppearanceColor(props, rampKey, "highColor")}
                disabled={colorDisabled}
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

type ColorThresholdPatch = Partial<Pick<
    ResolvedAppearanceSettings,
    "lowColorThresholdPercent" | "highColorThresholdPercent"
>>;

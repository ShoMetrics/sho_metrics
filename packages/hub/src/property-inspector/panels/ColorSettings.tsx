import type {
    ColorMode,
    ResolvedColorFilledThemeSettings,
    ResolvedMetricSolidChannelColors,
    ResolvedMultiColorSet,
} from "../../settings/resolved-settings";
import type {
    ResolvedColorFilledMultiColorSettingsOverride,
    ResolvedColorFilledSolidSettingsOverride,
    ResolvedMultiColorSetOverride,
} from "../../settings/appearance-overrides";
import type {
    ColorFilledThemeSettingsPatch,
    MetricColorSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { ColorBandSetting } from "../controls/ColorBandSetting";
import { ColorSetting } from "../controls/ColorSetting";
import { RangeSetting } from "../controls/RangeSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    colorFilledColorModeOptionList,
    metricColorModeOptionList,
} from "./setting-options";

type MetricChannelKey = "usage" | "download" | "upload" | "diskRead" | "diskWrite";
type SolidColorKey = keyof ResolvedMetricSolidChannelColors;
type MultiColorKey = keyof ResolvedMultiColorSet;

interface ThresholdPercentPatch {
    readonly lowThresholdPercent?: number | undefined;
    readonly highThresholdPercent?: number | undefined;
}

const solidColorKeyByChannel = {
    usage: "usageColor",
    download: "downloadColor",
    upload: "uploadColor",
    diskRead: "diskReadColor",
    diskWrite: "diskWriteColor",
} satisfies Record<MetricChannelKey, SolidColorKey>;

function patchMetricColorSettings(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    metricColor: MetricColorSettingsPatch,
): void {
    onSettingsPatch({ appearance: { metricColor } });
}

function patchColorFilledThemeSettings(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    colorFilled: ColorFilledThemeSettingsPatch,
): void {
    onSettingsPatch({ appearance: { theme: { colorFilled } } });
}

export function StandardColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context } = props;
    const appearance = context.resolved.widget.slot.appearance;

    if (appearance.theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <MetricColorControls
                colorMode={appearance.metricColor.colorMode}
                solidColor={appearance.metricColor.solid.colors.usageColor}
                multiColor={appearance.metricColor.multiColor.colors.usage}
                lowThresholdPercent={appearance.metricColor.multiColor.lowThresholdPercent}
                highThresholdPercent={appearance.metricColor.multiColor.highThresholdPercent}
                isSolidGradientEnabled={appearance.metricColor.solid.isGradientEnabled}
                isMultiColorGradientEnabled={appearance.metricColor.multiColor.isGradientEnabled}
                onColorModeChange={(colorMode) => patchMetricColorSettings(props.onSettingsPatch, { colorMode })}
                onSolidColorChange={(usageColor) => patchMetricColorSettings(props.onSettingsPatch, {
                    solid: { colors: { usageColor } },
                })}
                onMultiColorPatch={(usage) => patchMetricColorSettings(props.onSettingsPatch, {
                    multiColor: { colors: { usage } },
                })}
                onThresholdPatch={(thresholdPatch) => patchMetricColorSettings(props.onSettingsPatch, {
                    multiColor: thresholdPatch,
                })}
                onSolidGradientChange={(isGradientEnabled) => patchMetricColorSettings(props.onSettingsPatch, {
                    solid: { isGradientEnabled },
                })}
                onMultiColorGradientChange={(isGradientEnabled) => patchMetricColorSettings(props.onSettingsPatch, {
                    multiColor: { isGradientEnabled },
                })}
                disabled={props.colorDisabled ?? false}
            />
        </SettingsSection>
    );
}

interface MetricColorControlsProps {
    readonly colorMode: ColorMode;
    readonly solidColor: string;
    readonly multiColor: ResolvedMultiColorSet;
    readonly lowThresholdPercent: number;
    readonly highThresholdPercent: number;
    readonly isSolidGradientEnabled: boolean;
    readonly isMultiColorGradientEnabled: boolean;
    readonly onColorModeChange: (colorMode: ColorMode) => void;
    readonly onSolidColorChange: (color: string) => void;
    readonly onMultiColorPatch: (patch: ResolvedMultiColorSetOverride) => void;
    readonly onThresholdPatch: (patch: ThresholdPercentPatch) => void;
    readonly onSolidGradientChange: (isGradientEnabled: boolean) => void;
    readonly onMultiColorGradientChange: (isGradientEnabled: boolean) => void;
    readonly disabled?: boolean | undefined;
}

export function MetricColorControls({
    colorMode,
    solidColor,
    multiColor,
    lowThresholdPercent,
    highThresholdPercent,
    isSolidGradientEnabled,
    isMultiColorGradientEnabled,
    onColorModeChange,
    onSolidColorChange,
    onMultiColorPatch,
    onThresholdPatch,
    onSolidGradientChange,
    onMultiColorGradientChange,
    disabled = false,
}: MetricColorControlsProps): React.JSX.Element {
    let colorFields: React.JSX.Element | null = null;

    if (colorMode === "solid") {
        colorFields = (
            <>
                <ColorSetting
                    label="Solid Color"
                    value={solidColor}
                    onValueChange={onSolidColorChange}
                    disabled={disabled}
                />
                <GradientSetting
                    isEnabled={isSolidGradientEnabled}
                    onValueChange={onSolidGradientChange}
                    disabled={disabled}
                />
            </>
        );
    }

    if (colorMode === "multi-color") {
        colorFields = (
            <>
                <MultiColorSettings
                    colors={multiColor}
                    lowThresholdPercent={lowThresholdPercent}
                    highThresholdPercent={highThresholdPercent}
                    onMultiColorPatch={onMultiColorPatch}
                    onThresholdPatch={onThresholdPatch}
                    disabled={disabled}
                />
                <GradientSetting
                    isEnabled={isMultiColorGradientEnabled}
                    onValueChange={onMultiColorGradientChange}
                    disabled={disabled}
                />
            </>
        );
    }

    return (
        <>
            <SelectSetting
                label="Color Mode"
                value={colorMode}
                optionList={metricColorModeOptionList}
                onValueChange={onColorModeChange}
                disabled={disabled}
            />
            {colorFields}
        </>
    );
}

export function NetworkChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    if (props.context.resolved.widget.slot.appearance.theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    const shouldShowChannelColors =
        props.context.resolved.widget.slot.appearance.metricColor.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <MetricGradientSetting {...props} />
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
    if (props.context.resolved.widget.slot.appearance.theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    const shouldShowChannelColors =
        props.context.resolved.widget.slot.appearance.metricColor.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <MetricGradientSetting {...props} />
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
            value={context.resolved.widget.slot.appearance.metricColor.colorMode}
            optionList={metricColorModeOptionList}
            onValueChange={(colorMode) => patchMetricColorSettings(onSettingsPatch, { colorMode })}
            disabled={colorDisabled}
        />
    );
}

function MultiColorSettings({
    colors,
    lowThresholdPercent,
    highThresholdPercent,
    onMultiColorPatch,
    onThresholdPatch,
    disabled = false,
}: {
    readonly colors: ResolvedMultiColorSet;
    readonly lowThresholdPercent: number;
    readonly highThresholdPercent: number;
    readonly onMultiColorPatch: (patch: ResolvedMultiColorSetOverride) => void;
    readonly onThresholdPatch: (patch: ThresholdPercentPatch) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Range Colors" />
            <InspectorItem className="note-item note-item-default">
                <p className="section-note">Set the percentage ranges that choose low, medium, or high color.</p>
            </InspectorItem>
            <ThresholdRangeSettings
                lowThresholdPercent={lowThresholdPercent}
                highThresholdPercent={highThresholdPercent}
                onThresholdPatch={onThresholdPatch}
                disabled={disabled}
            />
            <ColorBandSetting
                label="Low Color"
                value={colors.lowColor}
                onValueChange={(lowColor) => onMultiColorPatch({ lowColor })}
                bandText={`0-${lowThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label="Medium Color"
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onMultiColorPatch({ mediumColor })}
                bandText={`${lowThresholdPercent}-${highThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label="High Color"
                value={colors.highColor}
                onValueChange={(highColor) => onMultiColorPatch({ highColor })}
                bandText={`${highThresholdPercent}-100%`}
                disabled={disabled}
            />
        </>
    );
}

function ColorFilledSettingsSection(props: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = props.context.resolved.widget.slot.appearance;

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Filled" />
            <SelectSetting
                label="Color Mode"
                value={appearance.metricColor.colorMode}
                optionList={colorFilledColorModeOptionList}
                onValueChange={(colorMode) => patchMetricColorSettings(props.onSettingsPatch, { colorMode })}
                disabled={props.colorDisabled ?? false}
            />
            <ColorFilledActiveColorControls
                colorMode={appearance.metricColor.colorMode}
                colorFilled={appearance.theme.colorFilled}
                onSolidPatch={(solid) => patchColorFilledThemeSettings(props.onSettingsPatch, { solid })}
                onMultiColorPatch={(multiColor) => patchColorFilledThemeSettings(props.onSettingsPatch, { multiColor })}
                disabled={props.themeDisabled}
            />
        </SettingsSection>
    );
}

function ColorFilledActiveColorControls({
    colorMode,
    colorFilled,
    onSolidPatch,
    onMultiColorPatch,
    disabled = false,
}: {
    readonly colorMode: ColorMode;
    readonly colorFilled: ResolvedColorFilledThemeSettings;
    readonly onSolidPatch: (patch: ResolvedColorFilledSolidSettingsOverride) => void;
    readonly onMultiColorPatch: (patch: ResolvedColorFilledMultiColorSettingsOverride) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element | null {
    if (colorMode === "black-white") {
        return null;
    }

    if (colorMode === "solid") {
        return (
            <>
                <ColorSetting
                    label="Background Color"
                    value={colorFilled.solid.color}
                    onValueChange={(color) => onSolidPatch({ color })}
                    disabled={disabled}
                />
                <GradientSetting
                    isEnabled={colorFilled.solid.isGradientEnabled}
                    onValueChange={(isGradientEnabled) => onSolidPatch({ isGradientEnabled })}
                    disabled={disabled}
                />
            </>
        );
    }

    return (
        <>
            <SectionHeading text="Color Mix" />
            <SoftTriangleColorSettings
                colors={colorFilled.multiColor.colors}
                onColorPatch={(colors) => onMultiColorPatch({ colors })}
                disabled={disabled}
            />
            <GradientSetting
                isEnabled={colorFilled.multiColor.isGradientEnabled}
                onValueChange={(isGradientEnabled) => onMultiColorPatch({ isGradientEnabled })}
                disabled={disabled}
            />
        </>
    );
}

export function ColorFilledThemeControls({
    colorFilled,
    onSolidPatch,
    onMultiColorPatch,
    disabled = false,
}: {
    readonly colorFilled: ResolvedColorFilledThemeSettings;
    readonly onSolidPatch: (patch: ResolvedColorFilledSolidSettingsOverride) => void;
    readonly onMultiColorPatch: (patch: ResolvedColorFilledMultiColorSettingsOverride) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Solid Background" />
            <ColorSetting
                label="Background Color"
                value={colorFilled.solid.color}
                onValueChange={(color) => onSolidPatch({ color })}
                disabled={disabled}
            />
            <GradientSetting
                isEnabled={colorFilled.solid.isGradientEnabled}
                onValueChange={(isGradientEnabled) => onSolidPatch({ isGradientEnabled })}
                disabled={disabled}
            />
            <SectionHeading text="Color Mix" />
            <SoftTriangleColorSettings
                colors={colorFilled.multiColor.colors}
                onColorPatch={(colors) => onMultiColorPatch({ colors })}
                disabled={disabled}
            />
            <GradientSetting
                isEnabled={colorFilled.multiColor.isGradientEnabled}
                onValueChange={(isGradientEnabled) => onMultiColorPatch({ isGradientEnabled })}
                disabled={disabled}
            />
        </>
    );
}

function SoftTriangleColorSettings({
    colors,
    onColorPatch,
    disabled,
}: {
    readonly colors: ResolvedMultiColorSet;
    readonly onColorPatch: (patch: ResolvedMultiColorSetOverride) => void;
    readonly disabled: boolean;
}): React.JSX.Element {
    return (
        <>
            <ColorBandSetting
                label="Top Color"
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onColorPatch({ mediumColor })}
                bandText="Top"
                disabled={disabled}
            />
            <ColorBandSetting
                label="Left Color"
                value={colors.lowColor}
                onValueChange={(lowColor) => onColorPatch({ lowColor })}
                bandText="Left"
                disabled={disabled}
            />
            <ColorBandSetting
                label="Right Color"
                value={colors.highColor}
                onValueChange={(highColor) => onColorPatch({ highColor })}
                bandText="Right"
                disabled={disabled}
            />
        </>
    );
}

function GradientSetting({
    isEnabled,
    onValueChange,
    disabled,
}: {
    readonly isEnabled: boolean;
    readonly onValueChange: (isEnabled: boolean) => void;
    readonly disabled: boolean;
}): React.JSX.Element {
    return (
        <InspectorItem label="Gradient">
            <label className="native-checkbox-row">
                <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={disabled}
                    onChange={(event) => onValueChange(event.currentTarget.checked)}
                />
                <span>Smooth gradient</span>
            </label>
        </InspectorItem>
    );
}

function ChannelThresholdControls(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    const metricColor = props.context.resolved.widget.slot.appearance.metricColor;

    if (metricColor.colorMode !== "multi-color") {
        return null;
    }

    return (
        <>
            <SectionHeading text="Range Colors" />
            <ThresholdRangeSettings
                lowThresholdPercent={metricColor.multiColor.lowThresholdPercent}
                highThresholdPercent={metricColor.multiColor.highThresholdPercent}
                onThresholdPatch={(thresholdPatch) => patchMetricColorSettings(props.onSettingsPatch, {
                    multiColor: thresholdPatch,
                })}
                disabled={props.colorDisabled ?? false}
            />
        </>
    );
}

function MetricGradientSetting(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    const metricColor = props.context.resolved.widget.slot.appearance.metricColor;

    if (metricColor.colorMode === "black-white") {
        return null;
    }

    if (metricColor.colorMode === "solid") {
        return (
            <GradientSetting
                isEnabled={metricColor.solid.isGradientEnabled}
                onValueChange={(isGradientEnabled) => patchMetricColorSettings(props.onSettingsPatch, {
                    solid: { isGradientEnabled },
                })}
                disabled={props.colorDisabled ?? false}
            />
        );
    }

    return (
        <GradientSetting
            isEnabled={metricColor.multiColor.isGradientEnabled}
            onValueChange={(isGradientEnabled) => patchMetricColorSettings(props.onSettingsPatch, {
                multiColor: { isGradientEnabled },
            })}
            disabled={props.colorDisabled ?? false}
        />
    );
}

function ThresholdRangeSettings({
    lowThresholdPercent,
    highThresholdPercent,
    onThresholdPatch,
    disabled = false,
}: {
    readonly lowThresholdPercent: number;
    readonly highThresholdPercent: number;
    readonly onThresholdPatch: (patch: ThresholdPercentPatch) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <RangeSetting
                label="Low Ends At"
                value={lowThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(nextLowThresholdPercent) => {
                    const patch = nextLowThresholdPercent > highThresholdPercent
                        ? {
                            lowThresholdPercent: nextLowThresholdPercent,
                            highThresholdPercent: nextLowThresholdPercent,
                        }
                        : { lowThresholdPercent: nextLowThresholdPercent };

                    onThresholdPatch(patch);
                }}
                disabled={disabled}
            />
            <RangeSetting
                label="High Starts At"
                value={highThresholdPercent}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(nextHighThresholdPercent) => {
                    const patch = nextHighThresholdPercent < lowThresholdPercent
                        ? {
                            lowThresholdPercent: nextHighThresholdPercent,
                            highThresholdPercent: nextHighThresholdPercent,
                        }
                        : { highThresholdPercent: nextHighThresholdPercent };

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
            <ChannelColorFields {...props} channel="download" />
        </>
    );
}

function NetworkUploadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Color - Upload" />
            <ChannelColorFields {...props} channel="upload" />
        </>
    );
}

function DiskReadColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Read" />
            <ChannelColorFields {...props} channel="diskRead" />
        </>
    );
}

function DiskWriteColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    return (
        <>
            <SectionHeading text="Write" />
            <ChannelColorFields {...props} channel="diskWrite" />
        </>
    );
}

function ChannelColorFields({
    channel,
    context,
    onSettingsPatch,
    colorDisabled = false,
}: WidgetSettingsPanelProps & {
    channel: Exclude<MetricChannelKey, "usage">;
}): React.JSX.Element {
    const metricColor = context.resolved.widget.slot.appearance.metricColor;
    const solidColorKey = solidColorKeyByChannel[channel];

    function patchSolidChannelColor(color: string): void {
        patchMetricColorSettings(onSettingsPatch, {
            solid: {
                colors: {
                    [solidColorKey]: color,
                },
            },
        });
    }

    function patchMultiColorChannel(colorKey: MultiColorKey, value: string): void {
        patchMetricColorSettings(onSettingsPatch, {
            multiColor: {
                colors: {
                    [channel]: {
                        [colorKey]: value,
                    },
                },
            },
        });
    }

    if (metricColor.colorMode !== "multi-color") {
        return (
            <ColorSetting
                label="Solid Color"
                value={metricColor.solid.colors[solidColorKey]}
                onValueChange={patchSolidChannelColor}
                disabled={colorDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                label="Low Color"
                value={metricColor.multiColor.colors[channel].lowColor}
                onValueChange={(lowColor) => patchMultiColorChannel("lowColor", lowColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="Medium Color"
                value={metricColor.multiColor.colors[channel].mediumColor}
                onValueChange={(mediumColor) => patchMultiColorChannel("mediumColor", mediumColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="High Color"
                value={metricColor.multiColor.colors[channel].highColor}
                onValueChange={(highColor) => patchMultiColorChannel("highColor", highColor)}
                disabled={colorDisabled}
            />
        </>
    );
}

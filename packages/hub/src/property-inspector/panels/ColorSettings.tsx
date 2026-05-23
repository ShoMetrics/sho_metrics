import type {
    ColorMode,
    MetricTheme,
    ResolvedColorFilledPaintSettings,
    ResolvedMetricSolidChannelColors,
    ResolvedMultiColorSet,
    ResolvedTerminalPaintSettings,
} from "../../settings/resolved-settings";
import type {
    ResolvedColorFilledPaintSettingsOverride,
    ResolvedColorFilledMultiColorPaintSettingsOverride,
    ResolvedColorFilledSolidPaintSettingsOverride,
    ResolvedMetricPaintSettingsOverride,
    ResolvedMultiColorSetOverride,
    ResolvedTerminalPaintSettingsOverride,
} from "../../settings/appearance-overrides";
import {
    buildColorFilledPaintAppearanceOverride,
    buildMetricAccentPaintAppearanceOverride,
    buildTerminalPaintAppearanceOverride,
} from "../../settings/appearance-overrides";
import {
    resolveActiveColorFilledPaint,
    resolveActiveMetricAccentPaint,
    resolveActiveTerminalPaint,
} from "../../settings/render-paint-resolver";
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
    metricPaintColorModeOptionList,
    terminalPaletteOptionList,
} from "./setting-options";

type MetricChannelKey = "usage" | "download" | "upload" | "diskRead" | "diskWrite";
type MetricColorChannelKey = Exclude<MetricChannelKey, "usage">;
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

const networkColorChannels = [
    { channel: "upload", heading: "Color - Upload" },
    { channel: "download", heading: "Color - Download" },
] as const satisfies readonly ChannelColorSectionSettings[];

const diskThroughputColorChannels = [
    { channel: "diskRead", heading: "Read" },
    { channel: "diskWrite", heading: "Write" },
] as const satisfies readonly ChannelColorSectionSettings[];

interface ChannelColorSectionSettings {
    readonly channel: MetricColorChannelKey;
    readonly heading: string;
}

function patchMetricPaintSettings(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    selectedTheme: MetricTheme,
    metric: ResolvedMetricPaintSettingsOverride,
): void {
    const appearance = buildMetricAccentPaintAppearanceOverride(selectedTheme, metric);
    if (appearance !== undefined) {
        onSettingsPatch({ appearance });
    }
}

function patchColorFilledPaintSettings(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    colorFilled: ResolvedColorFilledPaintSettingsOverride,
): void {
    onSettingsPatch({ appearance: buildColorFilledPaintAppearanceOverride(colorFilled) });
}

function patchTerminalPaintSettings(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    terminal: ResolvedTerminalPaintSettingsOverride,
): void {
    onSettingsPatch({ appearance: buildTerminalPaintAppearanceOverride(terminal) });
}

export function StandardColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { context } = props;
    const appearance = context.resolved.widget.slot.appearance;
    const selectedTheme = appearance.theme.selectedTheme;

    if (selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    if (selectedTheme === "terminal") {
        return <TerminalPaintSettingsSection {...props} />;
    }

    const metricPaint = resolveActiveMetricAccentPaint(appearance);
    if (metricPaint === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <MetricColorControls
                colorMode={metricPaint.colorMode}
                solidColor={metricPaint.solid.colors.usageColor}
                multiColor={metricPaint.multiColor.colors.usage}
                lowThresholdPercent={metricPaint.multiColor.lowThresholdPercent}
                highThresholdPercent={metricPaint.multiColor.highThresholdPercent}
                isSolidGradientEnabled={metricPaint.solid.isGradientEnabled}
                isMultiColorGradientEnabled={metricPaint.multiColor.isGradientEnabled}
                onColorModeChange={(colorMode) => patchMetricPaintSettings(
                    props.onSettingsPatch,
                    selectedTheme,
                    { colorMode },
                )}
                onSolidColorChange={(usageColor) => patchMetricPaintSettings(props.onSettingsPatch, selectedTheme, {
                    solid: { colors: { usageColor } },
                })}
                onMultiColorPatch={(usage) => patchMetricPaintSettings(props.onSettingsPatch, selectedTheme, {
                    multiColor: { colors: { usage } },
                })}
                onThresholdPatch={(thresholdPatch) => patchMetricPaintSettings(props.onSettingsPatch, selectedTheme, {
                    multiColor: thresholdPatch,
                })}
                onSolidGradientChange={(isGradientEnabled) => patchMetricPaintSettings(props.onSettingsPatch, selectedTheme, {
                    solid: { isGradientEnabled },
                })}
                onMultiColorGradientChange={(isGradientEnabled) => patchMetricPaintSettings(props.onSettingsPatch, selectedTheme, {
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
                optionList={metricPaintColorModeOptionList}
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

    if (props.context.resolved.widget.slot.appearance.theme.selectedTheme === "terminal") {
        return <TerminalPaintSettingsSection {...props} />;
    }

    const metricPaint = resolveActiveMetricAccentPaint(props.context.resolved.widget.slot.appearance);
    if (metricPaint === undefined) {
        return <></>;
    }

    const shouldShowChannelColors = metricPaint.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <MetricGradientSetting {...props} />
            <ChannelThresholdControls {...props} />
            {shouldShowChannelColors ? (
                <>
                    {networkColorChannels.map(channelSettings => (
                        <ChannelColorSection
                            key={channelSettings.channel}
                            {...props}
                            channel={channelSettings.channel}
                            heading={channelSettings.heading}
                        />
                    ))}
                </>
            ) : null}
        </SettingsSection>
    );
}

export function DiskThroughputChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    if (props.context.resolved.widget.slot.appearance.theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    if (props.context.resolved.widget.slot.appearance.theme.selectedTheme === "terminal") {
        return <TerminalPaintSettingsSection {...props} />;
    }

    const metricPaint = resolveActiveMetricAccentPaint(props.context.resolved.widget.slot.appearance);
    if (metricPaint === undefined) {
        return <></>;
    }

    const shouldShowChannelColors = metricPaint.colorMode !== "black-white";

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Settings" />
            <ColorModeSetting {...props} />
            <MetricGradientSetting {...props} />
            <ChannelThresholdControls {...props} />
            {shouldShowChannelColors ? (
                <>
                    {diskThroughputColorChannels.map(channelSettings => (
                        <ChannelColorSection
                            key={channelSettings.channel}
                            {...props}
                            channel={channelSettings.channel}
                            heading={channelSettings.heading}
                        />
                    ))}
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
    const appearance = context.resolved.widget.slot.appearance;
    const metricPaint = resolveActiveMetricAccentPaint(appearance);
    if (metricPaint === undefined) {
        return <></>;
    }

    return (
        <SelectSetting
            label="Color Mode"
            value={metricPaint.colorMode}
            optionList={metricPaintColorModeOptionList}
            onValueChange={(colorMode) => patchMetricPaintSettings(
                onSettingsPatch,
                appearance.theme.selectedTheme,
                { colorMode },
            )}
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
    const colorFilledPaint = resolveActiveColorFilledPaint(appearance);
    if (colorFilledPaint === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Color Filled" />
            <ColorFilledPaintControls
                colorFilled={colorFilledPaint}
                onColorModeChange={(colorMode) => patchColorFilledPaintSettings(props.onSettingsPatch, { colorMode })}
                onSolidPatch={(solid) => patchColorFilledPaintSettings(props.onSettingsPatch, { solid })}
                onMultiColorPatch={(multiColor) => patchColorFilledPaintSettings(props.onSettingsPatch, { multiColor })}
                disabled={(props.colorDisabled ?? false) || (props.themeDisabled ?? false)}
            />
        </SettingsSection>
    );
}

function TerminalPaintSettingsSection(props: WidgetSettingsPanelProps): React.JSX.Element {
    const appearance = props.context.resolved.widget.slot.appearance;
    const terminalPaint = resolveActiveTerminalPaint(appearance);
    if (terminalPaint === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title="Colors">
            <SectionHeading text="Terminal" />
            <TerminalPaintControls
                terminalPaint={terminalPaint}
                onPaintPatch={(paint) => patchTerminalPaintSettings(props.onSettingsPatch, paint)}
                disabled={props.colorDisabled ?? false}
            />
        </SettingsSection>
    );
}

export function TerminalPaintControls({
    terminalPaint,
    onPaintPatch,
    disabled = false,
}: {
    readonly terminalPaint: ResolvedTerminalPaintSettings;
    readonly onPaintPatch: (patch: ResolvedTerminalPaintSettingsOverride) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <SelectSetting
            label="Phosphor"
            value={terminalPaint.preset}
            optionList={terminalPaletteOptionList}
            onValueChange={(preset) => onPaintPatch({ preset })}
            disabled={disabled}
        />
    );
}

function ColorFilledActiveColorControls({
    colorFilled,
    onSolidPatch,
    onMultiColorPatch,
    disabled = false,
}: {
    readonly colorFilled: ResolvedColorFilledPaintSettings;
    readonly onSolidPatch: (patch: ResolvedColorFilledSolidPaintSettingsOverride) => void;
    readonly onMultiColorPatch: (patch: ResolvedColorFilledMultiColorPaintSettingsOverride) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element | null {
    if (colorFilled.colorMode === "black-white") {
        return null;
    }

    if (colorFilled.colorMode === "solid") {
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

export function ColorFilledPaintControls({
    colorFilled,
    onColorModeChange,
    onSolidPatch,
    onMultiColorPatch,
    disabled = false,
}: {
    readonly colorFilled: ResolvedColorFilledPaintSettings;
    readonly onColorModeChange: (colorMode: ColorMode) => void;
    readonly onSolidPatch: (patch: ResolvedColorFilledSolidPaintSettingsOverride) => void;
    readonly onMultiColorPatch: (patch: ResolvedColorFilledMultiColorPaintSettingsOverride) => void;
    readonly disabled?: boolean | undefined;
}): React.JSX.Element {
    return (
        <>
            <SelectSetting
                label="Color Mode"
                value={colorFilled.colorMode}
                optionList={colorFilledColorModeOptionList}
                onValueChange={onColorModeChange}
                disabled={disabled}
            />
            <ColorFilledActiveColorControls
                colorFilled={colorFilled}
                onSolidPatch={onSolidPatch}
                onMultiColorPatch={onMultiColorPatch}
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
                label="Left Color"
                value={colors.lowColor}
                onValueChange={(lowColor) => onColorPatch({ lowColor })}
                bandText="Left"
                disabled={disabled}
            />
            <ColorBandSetting
                label="Right Color"
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onColorPatch({ mediumColor })}
                bandText="Right"
                disabled={disabled}
            />
            <ColorBandSetting
                label="Bottom Color"
                value={colors.highColor}
                onValueChange={(highColor) => onColorPatch({ highColor })}
                bandText="Bottom"
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
    const appearance = props.context.resolved.widget.slot.appearance;
    const metricPaint = resolveActiveMetricAccentPaint(appearance);

    if (metricPaint === undefined || metricPaint.colorMode !== "multi-color") {
        return null;
    }

    return (
        <>
            <SectionHeading text="Range Colors" />
            <ThresholdRangeSettings
                lowThresholdPercent={metricPaint.multiColor.lowThresholdPercent}
                highThresholdPercent={metricPaint.multiColor.highThresholdPercent}
                onThresholdPatch={(thresholdPatch) => patchMetricPaintSettings(
                    props.onSettingsPatch,
                    appearance.theme.selectedTheme,
                    { multiColor: thresholdPatch },
                )}
                disabled={props.colorDisabled ?? false}
            />
        </>
    );
}

function MetricGradientSetting(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    const appearance = props.context.resolved.widget.slot.appearance;
    const metricPaint = resolveActiveMetricAccentPaint(appearance);

    if (metricPaint === undefined || metricPaint.colorMode === "black-white") {
        return null;
    }

    if (metricPaint.colorMode === "solid") {
        return (
            <GradientSetting
                isEnabled={metricPaint.solid.isGradientEnabled}
                onValueChange={(isGradientEnabled) => patchMetricPaintSettings(
                    props.onSettingsPatch,
                    appearance.theme.selectedTheme,
                    { solid: { isGradientEnabled } },
                )}
                disabled={props.colorDisabled ?? false}
            />
        );
    }

    return (
        <GradientSetting
            isEnabled={metricPaint.multiColor.isGradientEnabled}
            onValueChange={(isGradientEnabled) => patchMetricPaintSettings(
                props.onSettingsPatch,
                appearance.theme.selectedTheme,
                { multiColor: { isGradientEnabled } },
            )}
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

function ChannelColorSection({
    channel,
    heading,
    ...props
}: WidgetSettingsPanelProps & ChannelColorSectionSettings): React.JSX.Element {
    return (
        <>
            <SectionHeading text={heading} />
            <ChannelColorFields {...props} channel={channel} />
        </>
    );
}

function ChannelColorFields({
    channel,
    context,
    onSettingsPatch,
    colorDisabled = false,
}: WidgetSettingsPanelProps & {
    channel: MetricColorChannelKey;
}): React.JSX.Element {
    const appearance = context.resolved.widget.slot.appearance;
    const selectedTheme = appearance.theme.selectedTheme;
    const metricPaint = resolveActiveMetricAccentPaint(appearance);
    const solidColorKey = solidColorKeyByChannel[channel];

    if (metricPaint === undefined) {
        return <></>;
    }

    function patchSolidChannelColor(color: string): void {
        patchMetricPaintSettings(onSettingsPatch, selectedTheme, {
            solid: {
                colors: {
                    [solidColorKey]: color,
                },
            },
        });
    }

    function patchMultiColorChannel(colorKey: MultiColorKey, value: string): void {
        patchMetricPaintSettings(onSettingsPatch, selectedTheme, {
            multiColor: {
                colors: {
                    [channel]: {
                        [colorKey]: value,
                    },
                },
            },
        });
    }

    if (metricPaint.colorMode !== "multi-color") {
        return (
            <ColorSetting
                label="Solid Color"
                value={metricPaint.solid.colors[solidColorKey]}
                onValueChange={patchSolidChannelColor}
                disabled={colorDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                label="Low Color"
                value={metricPaint.multiColor.colors[channel].lowColor}
                onValueChange={(lowColor) => patchMultiColorChannel("lowColor", lowColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="Medium Color"
                value={metricPaint.multiColor.colors[channel].mediumColor}
                onValueChange={(mediumColor) => patchMultiColorChannel("mediumColor", mediumColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label="High Color"
                value={metricPaint.multiColor.colors[channel].highColor}
                onValueChange={(highColor) => patchMultiColorChannel("highColor", highColor)}
                disabled={colorDisabled}
            />
        </>
    );
}

import type {
    ColorMode,
    MetricTheme,
    ResolvedAppearanceSettings,
    ResolvedColorFilledPaintSettings,
    ResolvedMetricSolidChannelColors,
    ResolvedMultiColorSet,
    ResolvedTerminalPaintSettings,
    ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
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
import { colorMessages } from "../../i18n/message-groups/color";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import type { LocalizedMessage } from "../../i18n/types";
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
    { channel: "upload", heading: colorMessages.colorUploadHeading },
    { channel: "download", heading: colorMessages.colorDownloadHeading },
] as const satisfies readonly ChannelColorSectionSettings[];

const diskThroughputColorChannels = [
    { channel: "diskRead", heading: optionMessages.readOption },
    { channel: "diskWrite", heading: optionMessages.writeOption },
] as const satisfies readonly ChannelColorSectionSettings[];

interface ChannelColorSectionSettings {
    readonly channel: MetricColorChannelKey;
    readonly heading: LocalizedMessage;
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
    const { t } = useI18n();
    const { context } = props;
    const appearance = readSingleMetricAppearance(context.resolved);
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
        <SettingsSection title={t(commonMessages.colorsSection)}>
            <SectionHeading text={t(colorMessages.colorSettingsHeading)} />
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
    const { t } = useI18n();
    let colorFields: React.JSX.Element | null = null;

    if (colorMode === "solid") {
        colorFields = (
            <>
                <ColorSetting
                    label={t(colorMessages.solidColorLabel)}
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
                label={t(colorMessages.colorModeLabel)}
                value={colorMode}
                optionList={localizeOptionList(t, metricPaintColorModeOptionList, metricPaintColorModeMessageByValue)}
                onValueChange={onColorModeChange}
                disabled={disabled}
            />
            {colorFields}
        </>
    );
}

export function NetworkChannelColorSettings(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { t } = useI18n();
    if (readSingleMetricAppearance(props.context.resolved).theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    if (readSingleMetricAppearance(props.context.resolved).theme.selectedTheme === "terminal") {
        return <TerminalPaintSettingsSection {...props} />;
    }

    const metricPaint = resolveActiveMetricAccentPaint(readSingleMetricAppearance(props.context.resolved));
    if (metricPaint === undefined) {
        return <></>;
    }

    const shouldShowChannelColors = metricPaint.colorMode !== "black-white";

    return (
        <SettingsSection title={t(commonMessages.colorsSection)}>
            <SectionHeading text={t(colorMessages.colorSettingsHeading)} />
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
    const { t } = useI18n();
    if (readSingleMetricAppearance(props.context.resolved).theme.selectedTheme === "color-filled") {
        return <ColorFilledSettingsSection {...props} />;
    }

    if (readSingleMetricAppearance(props.context.resolved).theme.selectedTheme === "terminal") {
        return <TerminalPaintSettingsSection {...props} />;
    }

    const metricPaint = resolveActiveMetricAccentPaint(readSingleMetricAppearance(props.context.resolved));
    if (metricPaint === undefined) {
        return <></>;
    }

    const shouldShowChannelColors = metricPaint.colorMode !== "black-white";

    return (
        <SettingsSection title={t(commonMessages.colorsSection)}>
            <SectionHeading text={t(colorMessages.colorSettingsHeading)} />
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
    const { t } = useI18n();
    const appearance = readSingleMetricAppearance(context.resolved);
    const metricPaint = resolveActiveMetricAccentPaint(appearance);
    if (metricPaint === undefined) {
        return <></>;
    }

    return (
        <SelectSetting
            label={t(colorMessages.colorModeLabel)}
            value={metricPaint.colorMode}
            optionList={localizeOptionList(t, metricPaintColorModeOptionList, metricPaintColorModeMessageByValue)}
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
    const { t } = useI18n();

    return (
        <>
            <SectionHeading text={t(colorMessages.rangeColorsHeading)} />
            <InspectorItem className="note-item note-item-default">
                <p className="section-note">{t(colorMessages.rangeColorsNote)}</p>
            </InspectorItem>
            <ThresholdRangeSettings
                lowThresholdPercent={lowThresholdPercent}
                highThresholdPercent={highThresholdPercent}
                onThresholdPatch={onThresholdPatch}
                disabled={disabled}
            />
            <ColorBandSetting
                label={t(colorMessages.lowColorLabel)}
                value={colors.lowColor}
                onValueChange={(lowColor) => onMultiColorPatch({ lowColor })}
                bandText={`0-${lowThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label={t(colorMessages.mediumColorLabel)}
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onMultiColorPatch({ mediumColor })}
                bandText={`${lowThresholdPercent}-${highThresholdPercent}%`}
                disabled={disabled}
            />
            <ColorBandSetting
                label={t(colorMessages.highColorLabel)}
                value={colors.highColor}
                onValueChange={(highColor) => onMultiColorPatch({ highColor })}
                bandText={`${highThresholdPercent}-100%`}
                disabled={disabled}
            />
        </>
    );
}

function ColorFilledSettingsSection(props: WidgetSettingsPanelProps): React.JSX.Element {
    const { t } = useI18n();
    const appearance = readSingleMetricAppearance(props.context.resolved);
    const colorFilledPaint = resolveActiveColorFilledPaint(appearance);
    if (colorFilledPaint === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title={t(commonMessages.colorsSection)}>
            <SectionHeading text={t(optionMessages.colorFilledOption)} />
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
    const { t } = useI18n();
    const appearance = readSingleMetricAppearance(props.context.resolved);
    const terminalPaint = resolveActiveTerminalPaint(appearance);
    if (terminalPaint === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title={t(commonMessages.colorsSection)}>
            <SectionHeading text={t(optionMessages.terminalOption)} />
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
    const { t } = useI18n();

    return (
        <SelectSetting
            label={t(colorMessages.phosphorLabel)}
            value={terminalPaint.preset}
            optionList={localizeOptionList(t, terminalPaletteOptionList, terminalPaletteMessageByValue)}
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
    const { t } = useI18n();

    if (colorFilled.colorMode === "black-white") {
        return null;
    }

    if (colorFilled.colorMode === "solid") {
        return (
            <>
                <ColorSetting
                    label={t(colorMessages.backgroundColorLabel)}
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
            <SectionHeading text={t(optionMessages.colorMixOption)} />
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
    const { t } = useI18n();

    return (
        <>
            <SelectSetting
                label={t(colorMessages.colorModeLabel)}
                value={colorFilled.colorMode}
                optionList={localizeOptionList(t, colorFilledColorModeOptionList, colorFilledColorModeMessageByValue)}
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
    const { t } = useI18n();

    return (
        <>
            <ColorBandSetting
                label={t(colorMessages.leftColorLabel)}
                value={colors.lowColor}
                onValueChange={(lowColor) => onColorPatch({ lowColor })}
                bandText={t(colorMessages.leftLabel)}
                disabled={disabled}
            />
            <ColorBandSetting
                label={t(colorMessages.rightColorLabel)}
                value={colors.mediumColor}
                onValueChange={(mediumColor) => onColorPatch({ mediumColor })}
                bandText={t(colorMessages.rightLabel)}
                disabled={disabled}
            />
            <ColorBandSetting
                label={t(colorMessages.bottomColorLabel)}
                value={colors.highColor}
                onValueChange={(highColor) => onColorPatch({ highColor })}
                bandText={t(colorMessages.bottomLabel)}
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
    const { t } = useI18n();

    return (
        <InspectorItem label={t(colorMessages.gradientLabel)}>
            <label className="native-checkbox-row">
                <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={disabled}
                    onChange={(event) => onValueChange(event.currentTarget.checked)}
                />
                <span>{t(colorMessages.smoothGradientLabel)}</span>
            </label>
        </InspectorItem>
    );
}

function ChannelThresholdControls(props: WidgetSettingsPanelProps): React.JSX.Element | null {
    const { t } = useI18n();
    const appearance = readSingleMetricAppearance(props.context.resolved);
    const metricPaint = resolveActiveMetricAccentPaint(appearance);

    if (metricPaint === undefined || metricPaint.colorMode !== "multi-color") {
        return null;
    }

    return (
        <>
            <SectionHeading text={t(colorMessages.rangeColorsHeading)} />
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
    const appearance = readSingleMetricAppearance(props.context.resolved);
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
    const { t } = useI18n();

    return (
        <>
            <RangeSetting
                label={t(colorMessages.lowEndsAtLabel)}
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
                label={t(colorMessages.highStartsAtLabel)}
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
    const { t } = useI18n();

    return (
        <>
            <SectionHeading text={t(heading)} />
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
    const { t } = useI18n();
    const appearance = readSingleMetricAppearance(context.resolved);
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
                label={t(colorMessages.solidColorLabel)}
                value={metricPaint.solid.colors[solidColorKey]}
                onValueChange={patchSolidChannelColor}
                disabled={colorDisabled}
            />
        );
    }

    return (
        <>
            <ColorSetting
                label={t(colorMessages.lowColorLabel)}
                value={metricPaint.multiColor.colors[channel].lowColor}
                onValueChange={(lowColor) => patchMultiColorChannel("lowColor", lowColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label={t(colorMessages.mediumColorLabel)}
                value={metricPaint.multiColor.colors[channel].mediumColor}
                onValueChange={(mediumColor) => patchMultiColorChannel("mediumColor", mediumColor)}
                disabled={colorDisabled}
            />
            <ColorSetting
                label={t(colorMessages.highColorLabel)}
                value={metricPaint.multiColor.colors[channel].highColor}
                onValueChange={(highColor) => patchMultiColorChannel("highColor", highColor)}
                disabled={colorDisabled}
            />
        </>
    );
}

const metricPaintColorModeMessageByValue = {
    "multi-color": optionMessages.rangeColorsOption,
    solid: optionMessages.solidColorOption,
    "black-white": optionMessages.blackWhiteOption,
} as const;

const colorFilledColorModeMessageByValue = {
    "multi-color": optionMessages.colorMixOption,
    solid: optionMessages.solidColorOption,
    "black-white": optionMessages.blackWhiteOption,
} as const;

const terminalPaletteMessageByValue = {
    green: optionMessages.greenOption,
    amber: optionMessages.amberOption,
    cyan: optionMessages.cyanOption,
    white: optionMessages.whiteOption,
} as const;

function readSingleMetricAppearance(settings: ResolvedWidgetSettings): ResolvedAppearanceSettings {
    return requireResolvedSingleMetricWidget(settings).slot.appearance;
}

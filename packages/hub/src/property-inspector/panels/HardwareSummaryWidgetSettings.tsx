import type {
    ResolvedAppearanceSettings,
    ResolvedCpuHardwareSummaryReading,
    ResolvedCpuHardwareSummaryReadings,
    ResolvedGpuHardwareSummaryReading,
    ResolvedGpuHardwareSummaryReadings,
    ResolvedHardwareSummaryReading,
    ResolvedHardwareSummaryWidget,
    TemperatureUnit,
} from "../../settings/resolved-settings";
import {
    buildColorFilledPaintAppearanceOverride,
    buildMetricAccentPaintAppearanceOverride,
    buildTerminalPaintAppearanceOverride,
    buildTransparentSurfaceAppearanceOverride,
} from "../../settings/appearance-overrides";
import {
    resolveActiveColorFilledPaint,
    resolveActiveMetricAccentPaint,
    resolveActiveTerminalPaint,
} from "../../settings/render-paint-resolver";
import { commonMessages } from "../../i18n/message-groups/shell";
import { colorMessages } from "../../i18n/message-groups/color";
import { cpuMessages, gpuMessages, hardwareSummaryMessages } from "../../i18n/message-groups/widgets";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import type { SelectOption } from "../inspector/types";
import { SelectSetting } from "../controls/SelectSetting";
import { TerminalVariantSetting } from "../controls/TerminalVariantSetting";
import { ThemeSetting } from "../controls/ThemeSetting";
import { TransparentSurfaceSetting } from "../controls/TransparentSurfaceSetting";
import { SectionHeading } from "../components/SectionHeading";
import {
    ColorFilledPaintControls,
    MetricColorControls,
    TerminalPaintControls,
} from "./ColorSettings";
import { MetricSourceSettings } from "./MetricSourceSettings";
import { PowerMaximumSetting, TemperatureMaximumSetting } from "./MetricMaximumSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import {
    buildCpuMetricKindOptionList,
    buildGpuMetricKindOptionList,
    isSummaryMetricKind,
    summaryMetricKindOption,
    temperatureUnitOptionList,
} from "./setting-options";

type CpuSummaryReadingKind = ResolvedCpuHardwareSummaryReading["kind"];
type GpuSummaryReadingKind = ResolvedGpuHardwareSummaryReading["kind"];
type CpuSummaryMetricChoice = CpuSummaryReadingKind | "summary";
type GpuSummaryMetricChoice = GpuSummaryReadingKind | "summary";
type HardwareSummaryReadingPosition = 0 | 1 | 2;
type HardwareSummaryScalePatch = NonNullable<StoredWidgetSettingsPatch["hardwareSummary"]>;

const DEFAULT_CPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_CPU_POWER_WATTS = 150;
const DEFAULT_GPU_TEMPERATURE_CELSIUS = 100;
const DEFAULT_GPU_POWER_WATTS = 300;

const hardwareSummaryReadingPositions = [0, 1, 2] as const satisfies readonly HardwareSummaryReadingPosition[];

const cpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    power: optionMessages.powerOption,
} as const;

const gpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    vram: optionMessages.vramOption,
    power: optionMessages.powerOption,
} as const;

const temperatureUnitMessageByValue = {
    celsius: optionMessages.celsiusOption,
    fahrenheit: optionMessages.fahrenheitOption,
} as const;

interface HardwareSummaryWidgetSettingsProps extends WidgetSettingsPanelProps {
    readonly widget: ResolvedHardwareSummaryWidget;
}

export function HardwareSummaryWidgetSettings({
    widget,
    ...panelProps
}: HardwareSummaryWidgetSettingsProps): React.JSX.Element {
    return (
        <>
            <HardwareSummaryMetricSettings {...panelProps} widget={widget} />
            <HardwareSummaryThemeSettings {...panelProps} widget={widget} />
            <HardwareSummaryScaleSettings {...panelProps} widget={widget} />
            <HardwareSummaryColorSettings {...panelProps} widget={widget} />
        </>
    );
}

function HardwareSummaryMetricSettings({
    widget,
    context,
    onSettingsPatch,
}: HardwareSummaryWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const target = widget.target;

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            {target.domain === "cpu" ? (
                <>
                    <SelectSetting
                        label={t(cpuMessages.cpuMetricLabel)}
                        value="summary"
                        optionList={localizeOptionList(
                            t,
                            [
                                summaryMetricKindOption,
                                ...buildCpuMetricKindOptionList(context.platform),
                            ] as const satisfies readonly SelectOption<CpuSummaryMetricChoice>[],
                            cpuMetricKindMessageByValue,
                        )}
                        onValueChange={(kind) => {
                            if (isSummaryMetricKind(kind)) {
                                return;
                            }

                            onSettingsPatch({
                                hardwareSummary: {
                                    switchTo: {
                                        widgetKind: "singleMetric",
                                        domain: "cpu",
                                        kind,
                                    },
                                },
                            });
                        }}
                    />
                    <CpuSummaryReadingSettings
                        platform={context.platform}
                        readings={target.orderedReadings}
                        onReadingsChange={(orderedReadings) => onSettingsPatch({
                            hardwareSummary: { orderedReadings },
                        })}
                    />
                </>
            ) : (
                <>
                    <SelectSetting
                        label={t(gpuMessages.gpuMetricLabel)}
                        value="summary"
                        optionList={localizeOptionList(
                            t,
                            [
                                summaryMetricKindOption,
                                ...buildGpuMetricKindOptionList(context.platform),
                            ] as const satisfies readonly SelectOption<GpuSummaryMetricChoice>[],
                            gpuMetricKindMessageByValue,
                        )}
                        onValueChange={(kind) => {
                            if (isSummaryMetricKind(kind)) {
                                return;
                            }

                            onSettingsPatch({
                                hardwareSummary: {
                                    switchTo: {
                                        widgetKind: "singleMetric",
                                        domain: "gpu",
                                        kind,
                                    },
                                },
                            });
                        }}
                    />
                    <GpuSummaryReadingSettings
                        platform={context.platform}
                        readings={target.orderedReadings}
                        onReadingsChange={(orderedReadings) => onSettingsPatch({
                            hardwareSummary: { orderedReadings },
                        })}
                    />
                    {context.isWindows && (
                        <MetricSourceSettings
                            sourcePolicy={widget.source}
                            onSourcePatch={(source) => onSettingsPatch({
                                hardwareSummary: { source },
                            })}
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
}

function CpuSummaryReadingSettings({
    platform,
    readings,
    onReadingsChange,
}: {
    readonly platform: WidgetSettingsPanelProps["context"]["platform"];
    readonly readings: ResolvedCpuHardwareSummaryReadings;
    readonly onReadingsChange: (readings: ResolvedCpuHardwareSummaryReadings) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <>
            {hardwareSummaryReadingPositions.map((position) => (
                <SelectSetting
                    key={position}
                    label={t(readingPositionLabelByPosition[position])}
                    value={readings[position].kind}
                    optionList={localizeOptionList(
                        t,
                        buildCpuMetricKindOptionList(platform, readings[position].kind),
                        cpuMetricKindMessageByValue,
                    )}
                    onValueChange={(kind) => onReadingsChange(
                        updateSummaryReadingOrder(readings, position, kind, buildDefaultCpuSummaryReading),
                    )}
                />
            ))}
        </>
    );
}

function GpuSummaryReadingSettings({
    platform,
    readings,
    onReadingsChange,
}: {
    readonly platform: WidgetSettingsPanelProps["context"]["platform"];
    readonly readings: ResolvedGpuHardwareSummaryReadings;
    readonly onReadingsChange: (readings: ResolvedGpuHardwareSummaryReadings) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <>
            {hardwareSummaryReadingPositions.map((position) => (
                <SelectSetting
                    key={position}
                    label={t(readingPositionLabelByPosition[position])}
                    value={readings[position].kind}
                    optionList={localizeOptionList(
                        t,
                        buildGpuMetricKindOptionList(platform, readings[position].kind),
                        gpuMetricKindMessageByValue,
                    )}
                    onValueChange={(kind) => onReadingsChange(
                        updateSummaryReadingOrder(readings, position, kind, buildDefaultGpuSummaryReading),
                    )}
                />
            ))}
        </>
    );
}

function HardwareSummaryThemeSettings({
    widget,
    onSettingsPatch,
    themeDisabled = false,
    transparentSurfaceDisabled = false,
}: HardwareSummaryWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const appearance = widget.appearance;

    return (
        <SettingsSection title={t(commonMessages.appearanceThemeSection)}>
            <ThemeSetting
                value={appearance.theme.selectedTheme}
                onValueChange={(selectedTheme) => onSettingsPatch({
                    hardwareSummary: { appearance: { theme: { selectedTheme } } },
                })}
                disabled={themeDisabled}
            />
            {appearance.theme.selectedTheme === "terminal" && (
                <TerminalVariantSetting
                    value={appearance.theme.terminal.variant}
                    onValueChange={(variant) => onSettingsPatch({
                        hardwareSummary: { appearance: { theme: { terminal: { variant } } } },
                    })}
                    disabled={themeDisabled}
                />
            )}
            <TransparentSurfaceSetting
                value={appearance.transparentSurface}
                onPatch={(transparentSurface) => onSettingsPatch({
                    hardwareSummary: {
                        appearance: buildTransparentSurfaceAppearanceOverride(transparentSurface),
                    },
                })}
                disabled={transparentSurfaceDisabled}
            />
        </SettingsSection>
    );
}

function HardwareSummaryScaleSettings({
    widget,
    onSettingsPatch,
}: HardwareSummaryWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const temperatureReading = findSummaryReadingByKind(widget.target.orderedReadings, "temperature");
    const powerReading = findSummaryReadingByKind(widget.target.orderedReadings, "power");
    if (temperatureReading === undefined && powerReading === undefined) {
        return <></>;
    }

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            {temperatureReading !== undefined && (
                <>
                    <SelectSetting
                        label={t(commonMessages.unitLabel)}
                        value={temperatureReading.unit}
                        optionList={localizeOptionList(t, temperatureUnitOptionList, temperatureUnitMessageByValue)}
                        onValueChange={(temperatureUnit) => onSettingsPatch({
                            hardwareSummary: buildDomainScalePatch(widget.target.domain, {
                                temperatureUnit,
                            }),
                        })}
                    />
                    <TemperatureMaximumSetting
                        value={temperatureReading.maximumCelsius}
                        onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                            hardwareSummary: buildDomainScalePatch(widget.target.domain, {
                                maximumTemperatureCelsius,
                            }),
                        })}
                    />
                </>
            )}
            {powerReading !== undefined && (
                <PowerMaximumSetting
                    value={powerReading.maximumWatts}
                    onValueChange={(maximumPowerWatts) => onSettingsPatch({
                        hardwareSummary: buildDomainScalePatch(widget.target.domain, {
                            maximumPowerWatts,
                        }),
                    })}
                />
            )}
        </SettingsSection>
    );
}

function HardwareSummaryColorSettings({
    widget,
    onSettingsPatch,
    colorDisabled = false,
    themeDisabled = false,
}: HardwareSummaryWidgetSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const appearance = widget.appearance;
    const selectedTheme = appearance.theme.selectedTheme;

    if (selectedTheme === "color-filled") {
        const colorFilledPaint = resolveActiveColorFilledPaint(appearance);
        if (colorFilledPaint === undefined) {
            return <></>;
        }

        return (
            <SettingsSection title={t(commonMessages.colorsSection)}>
                <SectionHeading text={t(optionMessages.colorFilledOption)} />
                <ColorFilledPaintControls
                    colorFilled={colorFilledPaint}
                    onColorModeChange={(colorMode) => onSettingsPatch({
                        hardwareSummary: { appearance: buildColorFilledPaintAppearanceOverride({ colorMode }) },
                    })}
                    onSolidPatch={(solid) => onSettingsPatch({
                        hardwareSummary: { appearance: buildColorFilledPaintAppearanceOverride({ solid }) },
                    })}
                    onMultiColorPatch={(multiColor) => onSettingsPatch({
                        hardwareSummary: { appearance: buildColorFilledPaintAppearanceOverride({ multiColor }) },
                    })}
                    disabled={colorDisabled || themeDisabled}
                />
            </SettingsSection>
        );
    }

    if (selectedTheme === "terminal") {
        const terminalPaint = resolveActiveTerminalPaint(appearance);
        if (terminalPaint === undefined) {
            return <></>;
        }

        return (
            <SettingsSection title={t(commonMessages.colorsSection)}>
                <SectionHeading text={t(optionMessages.terminalOption)} />
                <TerminalPaintControls
                    terminalPaint={terminalPaint}
                    onPaintPatch={(paint) => onSettingsPatch({
                        hardwareSummary: { appearance: buildTerminalPaintAppearanceOverride(paint) },
                    })}
                    disabled={colorDisabled}
                />
            </SettingsSection>
        );
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
                onColorModeChange={(colorMode) => patchMetricAccentPaint(
                    onSettingsPatch,
                    selectedTheme,
                    { colorMode },
                )}
                onSolidColorChange={(usageColor) => patchMetricAccentPaint(onSettingsPatch, selectedTheme, {
                    solid: { colors: { usageColor } },
                })}
                onMultiColorPatch={(usage) => patchMetricAccentPaint(onSettingsPatch, selectedTheme, {
                    multiColor: { colors: { usage } },
                })}
                onThresholdPatch={(thresholdPatch) => patchMetricAccentPaint(onSettingsPatch, selectedTheme, {
                    multiColor: thresholdPatch,
                })}
                onSolidGradientChange={(isGradientEnabled) => patchMetricAccentPaint(onSettingsPatch, selectedTheme, {
                    solid: { isGradientEnabled },
                })}
                onMultiColorGradientChange={(isGradientEnabled) => patchMetricAccentPaint(onSettingsPatch, selectedTheme, {
                    multiColor: { isGradientEnabled },
                })}
                disabled={colorDisabled}
            />
        </SettingsSection>
    );
}

const readingPositionLabelByPosition = [
    hardwareSummaryMessages.primaryMetricLabel,
    hardwareSummaryMessages.secondaryMetricOneLabel,
    hardwareSummaryMessages.secondaryMetricTwoLabel,
] as const;

function buildDomainScalePatch(
    domain: "cpu" | "gpu",
    patch: {
        readonly temperatureUnit?: TemperatureUnit | undefined;
        readonly maximumTemperatureCelsius?: number | undefined;
        readonly maximumPowerWatts?: number | undefined;
    },
): HardwareSummaryScalePatch {
    return domain === "cpu"
        ? { cpu: patch }
        : { gpu: patch };
}

function patchMetricAccentPaint(
    onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"],
    selectedTheme: ResolvedAppearanceSettings["theme"]["selectedTheme"],
    paint: Parameters<typeof buildMetricAccentPaintAppearanceOverride>[1],
): void {
    const appearance = buildMetricAccentPaintAppearanceOverride(selectedTheme, paint);
    if (appearance !== undefined) {
        onSettingsPatch({ hardwareSummary: { appearance } });
    }
}

function updateSummaryReadingOrder<TReading extends ResolvedHardwareSummaryReading>(
    readings: readonly [TReading, TReading, TReading],
    position: HardwareSummaryReadingPosition,
    kind: TReading["kind"],
    buildDefaultReading: (kind: TReading["kind"]) => TReading,
): readonly [TReading, TReading, TReading] {
    const next: [TReading, TReading, TReading] = [
        readings[0],
        readings[1],
        readings[2],
    ];
    const existingIndex = next.findIndex(reading => reading.kind === kind);
    if (existingIndex >= 0) {
        const existingReading = next[existingIndex];
        next[existingIndex] = next[position];
        next[position] = existingReading;
        return next;
    }

    next[position] = buildDefaultReading(kind);
    return next;
}

function buildDefaultCpuSummaryReading(kind: CpuSummaryReadingKind): ResolvedCpuHardwareSummaryReading {
    switch (kind) {
        case "usage":
            return { kind };
        case "temperature":
            return { kind, maximumCelsius: DEFAULT_CPU_TEMPERATURE_CELSIUS, unit: "celsius" };
        case "power":
            return { kind, maximumWatts: DEFAULT_CPU_POWER_WATTS };
    }
}

function buildDefaultGpuSummaryReading(kind: GpuSummaryReadingKind): ResolvedGpuHardwareSummaryReading {
    switch (kind) {
        case "usage":
        case "vram":
            return { kind };
        case "temperature":
            return { kind, maximumCelsius: DEFAULT_GPU_TEMPERATURE_CELSIUS, unit: "celsius" };
        case "power":
            return { kind, maximumWatts: DEFAULT_GPU_POWER_WATTS };
    }
}

function findSummaryReadingByKind<TKind extends ResolvedHardwareSummaryReading["kind"]>(
    readings: ResolvedHardwareSummaryWidget["target"]["orderedReadings"],
    kind: TKind,
): Extract<ResolvedHardwareSummaryReading, { readonly kind: TKind }> | undefined {
    for (const reading of readings) {
        if (reading.kind === kind) {
            return reading as Extract<ResolvedHardwareSummaryReading, { readonly kind: TKind }>;
        }
    }

    return undefined;
}

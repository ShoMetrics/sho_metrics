import { useEffect, useState } from "react";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { multiMetricMessages, systemMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import type { ResolvedAppearanceSettings, ResolvedDenseMultiMetricWidget, ResolvedMetricTarget } from "../../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../../settings/resolved-settings";
import {
    buildColorFilledPaintAppearanceOverride,
    buildMetricAccentPaintAppearanceOverride,
    buildTerminalPaintAppearanceOverride,
    buildTransparentSurfaceAppearanceOverride,
} from "../../../settings/appearance-overrides";
import {
    resolveActiveColorFilledPaint,
    resolveActiveMetricAccentPaint,
    resolveActiveTerminalPaint,
} from "../../../settings/render-paint-resolver";
import type { StoredWidgetSettingsPatch } from "../../../settings/storage/patch/widget-settings-patch";
import { TerminalVariantSetting } from "../../controls/TerminalVariantSetting";
import { ThemeSetting } from "../../controls/ThemeSetting";
import { TransparentSurfaceSetting } from "../../controls/TransparentSurfaceSetting";
import type { DenseMetricPreviewInput } from "../../previews/metric-option-preview";
import {
    ColorFilledPaintControls,
    MetricColorControls,
    TerminalPaintControls,
} from "../controls/ColorSettings";
import { DenseMetricRowsSettings } from "./DenseMetricRowsSettings";
import { PollingSettings } from "../controls/PollingSettings";
import { SettingsSection } from "../controls/SettingsSection";
import type { WidgetSettingsPanelProps } from "../panel-props";
import type { OptionLabelFormatter } from "../setting-options";
import {
    resolveBatteryPollingFrequencyOptionsForMinimum,
    resolveMinimumBatteryPollingFrequencySeconds,
} from "../battery-polling-options";

export function DenseMultiMetricWidgetSettings(props: WidgetSettingsPanelProps & {
    widget: ResolvedDenseMultiMetricWidget;
}): React.JSX.Element {
    const { t } = useI18n();
    const { widget } = props;
    const [editingCustomMetricSlotId, setEditingCustomMetricSlotId] = useState<string | undefined>(undefined);
    const isEditingCustomMetricSource = widget.slots.some(slot =>
        slot.slotId === editingCustomMetricSlotId
        && slot.slot.metric.target.domain === "customMetric",
    );

    useEffect(() => {
        if (editingCustomMetricSlotId === undefined || isEditingCustomMetricSource) {
            return;
        }

        setEditingCustomMetricSlotId(undefined);
    }, [editingCustomMetricSlotId, isEditingCustomMetricSource]);

    return (
        <>
            <DenseMetricRowsSettings
                {...props}
                editingCustomMetricSlotId={editingCustomMetricSlotId}
                onEditingCustomMetricSlotIdChange={setEditingCustomMetricSlotId}
            />
            {!isEditingCustomMetricSource && (
                <>
                    <DenseThemeSettings {...props} />
                    <DenseColorSettings {...props} />
                    <PollingSettings
                        {...props}
                        optionList={resolveDensePollingFrequencyOptions(
                            widget,
                            props.context.resolved.preferences.pollingFrequencySeconds,
                            t,
                        )}
                        note={resolveDensePollingNote(widget, t)}
                    />
                </>
            )}
        </>
    );
}

function resolveDensePollingFrequencyOptions(
    widget: ResolvedDenseMultiMetricWidget,
    currentPollingFrequencySeconds: number,
    t: OptionLabelFormatter,
): readonly { readonly value: number; readonly label: string }[] | undefined {
    return resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: resolveDenseMinimumPollingFrequencySeconds(widget),
        currentPollingFrequencySeconds,
        t,
    });
}

function resolveDensePollingNote(
    widget: ResolvedDenseMultiMetricWidget,
    t: ReturnType<typeof useI18n>["t"],
): string {
    const sharedPollingNote = t(multiMetricMessages.sharedPollingNote);
    return hasVendorHidBatteryRow(widget)
        ? `${sharedPollingNote}\n${t(systemMessages.infrequentPollingNote)}`
        : sharedPollingNote;
}

function resolveDenseMinimumPollingFrequencySeconds(widget: ResolvedDenseMultiMetricWidget): number {
    return Math.max(
        1,
        ...widget.slots.map(slot => resolveDenseRowMinimumPollingFrequencySeconds(slot.slot.metric.target)),
    );
}

function resolveDenseRowMinimumPollingFrequencySeconds(target: ResolvedMetricTarget): number {
    return target.domain === "system"
        ? resolveMinimumBatteryPollingFrequencySeconds(target.reading.peripheralIdentity)
        : 1;
}

function hasVendorHidBatteryRow(widget: ResolvedDenseMultiMetricWidget): boolean {
    return widget.slots.some(slot => {
        const target = slot.slot.metric.target;
        return target.domain === "system"
            && readSystemVendorHidPeripheralIdentity(target.reading.peripheralIdentity) !== undefined;
    });
}

function DenseThemeSettings({
    widget,
    onSettingsPatch,
    themeDisabled = false,
    transparentSurfaceDisabled = false,
}: WidgetSettingsPanelProps & {
    widget: ResolvedDenseMultiMetricWidget;
}): React.JSX.Element {
    const { t } = useI18n();
    const appearance = widget.appearance;

    return (
        <SettingsSection title={t(commonMessages.appearanceThemeSection)}>
            <ThemeSetting
                value={appearance.theme.selectedTheme}
                preview={buildDenseThemePreviewInput(appearance)}
                onValueChange={(selectedTheme) => onSettingsPatch({
                    dense: { appearance: { theme: { selectedTheme } } },
                })}
                disabled={themeDisabled}
            />
            {appearance.theme.selectedTheme === "terminal" && (
                <TerminalVariantSetting
                    value={appearance.theme.terminal.variant}
                    onValueChange={(variant) => onSettingsPatch({
                        dense: { appearance: { theme: { terminal: { variant } } } },
                    })}
                    disabled={themeDisabled}
                />
            )}
            <TransparentSurfaceSetting
                value={appearance.transparentSurface}
                onPatch={(transparentSurface) => onSettingsPatch({
                    dense: {
                        appearance: buildTransparentSurfaceAppearanceOverride(transparentSurface),
                    },
                })}
                disabled={transparentSurfaceDisabled}
            />
        </SettingsSection>
    );
}

function buildDenseThemePreviewInput(appearance: ResolvedAppearanceSettings): {
    readonly kind: "denseMetric";
    readonly input: DenseMetricPreviewInput;
} {
    return {
        kind: "denseMetric",
        input: {
            appearance,
            data: {
                rows: [
                    buildDenseThemePreviewRow("preview-cpu", "CPU", 45, "%", 0.45),
                    buildDenseThemePreviewRow("preview-gpu", "GPU", 68, "%", 0.68),
                    buildDenseThemePreviewRow("preview-ram", "RAM", 72, "%", 0.72),
                ],
            },
        },
    };
}

function buildDenseThemePreviewRow(
    slotId: string,
    label: string,
    current: number,
    unit: string,
    progress: number,
): DenseMetricPreviewInput["data"]["rows"][number] {
    return {
        rowKind: "configured",
        slotId,
        metricKey: slotId,
        widgetData: {
            current,
            progress,
            history: [],
            unit,
            label,
            displayValue: current.toFixed(0),
            sampleTimestampMilliseconds: 1,
        },
    };
}

function DenseColorSettings({
    widget,
    onSettingsPatch,
    colorDisabled = false,
    themeDisabled = false,
}: WidgetSettingsPanelProps & {
    widget: ResolvedDenseMultiMetricWidget;
}): React.JSX.Element {
    const { t } = useI18n();
    const appearance = widget.appearance;
    const selectedTheme = appearance.theme.selectedTheme;

    if (selectedTheme === "color-filled") {
        const colorFilled = resolveActiveColorFilledPaint(appearance);
        if (colorFilled === undefined) {
            return <></>;
        }

        return (
            <SettingsSection title={t(commonMessages.colorsSection)}>
                <ColorFilledPaintControls
                    colorFilled={colorFilled}
                    onColorModeChange={(colorMode) => onSettingsPatch({
                        dense: { appearance: buildColorFilledPaintAppearanceOverride({ colorMode }) },
                    })}
                    onSolidPatch={(solid) => onSettingsPatch({
                        dense: { appearance: buildColorFilledPaintAppearanceOverride({ solid }) },
                    })}
                    onMultiColorPatch={(multiColor) => onSettingsPatch({
                        dense: { appearance: buildColorFilledPaintAppearanceOverride({ multiColor }) },
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
                <TerminalPaintControls
                    terminalPaint={terminalPaint}
                    onPaintPatch={(terminal) => onSettingsPatch({
                        dense: { appearance: buildTerminalPaintAppearanceOverride(terminal) },
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
            <MetricColorControls
                colorMode={metricPaint.colorMode}
                solidColor={metricPaint.solid.colors.usageColor}
                multiColor={metricPaint.multiColor.colors.usage}
                lowThresholdPercent={metricPaint.multiColor.lowThresholdPercent}
                highThresholdPercent={metricPaint.multiColor.highThresholdPercent}
                isSolidGradientEnabled={metricPaint.solid.isGradientEnabled}
                isMultiColorGradientEnabled={metricPaint.multiColor.isGradientEnabled}
                onColorModeChange={(colorMode) => patchDenseMetricPaint(onSettingsPatch, appearance, { colorMode })}
                onSolidColorChange={(usageColor) => patchDenseMetricPaint(onSettingsPatch, appearance, {
                    solid: { colors: { usageColor } },
                })}
                onMultiColorPatch={(usage) => patchDenseMetricPaint(onSettingsPatch, appearance, {
                    multiColor: { colors: { usage } },
                })}
                onThresholdPatch={(multiColor) => patchDenseMetricPaint(onSettingsPatch, appearance, { multiColor })}
                onSolidGradientChange={(isGradientEnabled) => patchDenseMetricPaint(onSettingsPatch, appearance, {
                    solid: { isGradientEnabled },
                })}
                onMultiColorGradientChange={(isGradientEnabled) => patchDenseMetricPaint(onSettingsPatch, appearance, {
                    multiColor: { isGradientEnabled },
                })}
                disabled={colorDisabled}
            />
        </SettingsSection>
    );
}

function patchDenseMetricPaint(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    appearance: ResolvedAppearanceSettings,
    metric: Parameters<typeof buildMetricAccentPaintAppearanceOverride>[1],
): void {
    const patch = buildMetricAccentPaintAppearanceOverride(appearance.theme.selectedTheme, metric);
    if (patch !== undefined) {
        onSettingsPatch({ dense: { appearance: patch } });
    }
}

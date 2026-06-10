import { composeMetricViewFrame, type SingleMetricRenderOptions } from "../../view-rendering/metric-view-frame";
import type { WidgetData } from "../../view-rendering/widget-data";
import { buildDefaultAppearanceSettings } from "../../settings/default-appearance-settings";
import { mergeResolvedAppearanceSettings, type ResolvedAppearanceSettingsOverride } from "../../settings/appearance-overrides";
import type {
    CircleViewVariant,
    MetricView,
    MetricTheme,
    ResolvedAppearanceSettings,
    ResolvedMetricTarget,
    TerminalThemeVariant,
    TextViewVariant,
} from "../../settings/resolved-settings";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";
import type { HardwareIconKind } from "../../widgets/icons/hardware-icons";
import { getNetworkDirectionStatusIcon, renderNetworkDirectionIconFragment } from "../../widgets/icons/catalog/network";
import { formatMetricUnit } from "../../metrics/metric-unit-format";
import type { DenseMetricWidgetData } from "../../actions/dense-multi-metric/row-data";

export interface MetricPreviewInput {
    readonly appearance: ResolvedAppearanceSettings;
    readonly target: ResolvedMetricTarget;
}

export interface DenseMetricPreviewInput {
    readonly appearance: ResolvedAppearanceSettings;
    readonly data: DenseMetricWidgetData;
}

interface MetricPreviewSample {
    readonly widgetData: WidgetData;
    readonly centerIconFragment: string;
    readonly topIconFragment: string;
    readonly statusIcon: SingleMetricRenderOptions["statusIcon"];
}

interface HardwarePreviewSampleOptions {
    readonly hardware: HardwareIconKind;
    readonly label: string;
    readonly current: number;
    readonly unit?: string | undefined;
    readonly progress?: number | undefined;
    readonly displayValue?: string | undefined;
    readonly secondaryDisplayValue?: string | undefined;
    readonly barLabel?: string | undefined;
}

const DEFAULT_PREVIEW_TARGET = {
    domain: "cpu",
    reading: { kind: "usage" },
} satisfies ResolvedMetricTarget;

const SAMPLE_HISTORY = [18, 24, 21, 36, 31, 47, 42, 58, 53, 69, 62, 76, 68] as const;
const PREVIEW_SAMPLE_TIMESTAMP_MILLISECONDS = 1;
const NETWORK_DIRECTION_ICON_SIZE = 30;

export function buildMetricViewPreviewUri(
    selectedView: MetricView,
    input?: MetricPreviewInput | undefined,
): string {
    return buildMetricPreviewUri(input, {
        view: { selectedView },
    });
}

export function buildCircleVariantPreviewUri(
    circleVariant: CircleViewVariant,
    input?: MetricPreviewInput | undefined,
): string {
    return buildMetricPreviewUri(input, {
        view: {
            selectedView: "circle",
            circleVariant,
        },
    });
}

export function buildTextVariantPreviewUri(
    textVariant: TextViewVariant,
    input?: MetricPreviewInput | undefined,
): string {
    return buildMetricPreviewUri(input, {
        view: {
            selectedView: "text",
            textVariant,
        },
    });
}

export function buildMetricThemePreviewUri(
    selectedTheme: MetricTheme,
    input?: MetricPreviewInput | undefined,
): string {
    return buildMetricPreviewUri(input, {
        theme: { selectedTheme },
    });
}

export function buildDenseMetricThemePreviewUri(
    selectedTheme: MetricTheme,
    input: DenseMetricPreviewInput,
): string {
    const appearance = mergeResolvedAppearanceSettings(input.appearance, {
        theme: { selectedTheme },
    });
    const icons = buildMetricViewIcons({
        hardware: "unknown",
        status: "percentage",
    });
    const frame = composeMetricViewFrame({
        renderTarget: "key",
        viewOptions: {
            metricRenderKind: "denseMetric",
            resolvedSettings: appearance,
            widgetData: input.data,
            centerIconFragment: "",
            topIconFragment: "",
            statusIcon: icons.statusIcon,
        },
    });

    return `data:image/svg+xml,${encodeURIComponent(frame.svg)}`;
}

export function buildTerminalVariantPreviewUri(
    variant: TerminalThemeVariant,
    input?: MetricPreviewInput | undefined,
): string {
    return buildMetricPreviewUri(input, {
        theme: {
            selectedTheme: "terminal",
            terminal: { variant },
        },
    });
}

function buildMetricPreviewUri(
    input: MetricPreviewInput | undefined,
    appearanceOverride: ResolvedAppearanceSettingsOverride,
): string {
    const previewInput = input ?? {
        appearance: buildDefaultAppearanceSettings(),
        target: DEFAULT_PREVIEW_TARGET,
    };
    const appearance = mergeResolvedAppearanceSettings(previewInput.appearance, appearanceOverride);
    const sample = buildMetricPreviewSample(previewInput.target);
    const frame = composeMetricViewFrame({
        renderTarget: "key",
        viewOptions: {
            metricRenderKind: "singleMetric",
            resolvedSettings: appearance,
            widgetData: sample.widgetData,
            centerIconFragment: sample.centerIconFragment,
            topIconFragment: sample.topIconFragment,
            statusIcon: sample.statusIcon,
        },
    });

    return `data:image/svg+xml,${encodeURIComponent(frame.svg)}`;
}

function buildMetricPreviewSample(target: ResolvedMetricTarget): MetricPreviewSample {
    switch (target.domain) {
        case "cpu":
            return buildHardwarePreviewSample({
                hardware: "cpu",
                label: "CPU",
                current: 68,
                secondaryDisplayValue: "8-core",
            });
        case "memory":
            return buildHardwarePreviewSample({
                hardware: "memory",
                label: "RAM",
                current: 62,
                secondaryDisplayValue: "19 / 32 GB",
            });
        case "gpu":
            return buildHardwarePreviewSample({
                hardware: "gpu",
                label: "GPU",
                current: 68,
                secondaryDisplayValue: "RTX",
            });
        case "network":
            return buildNetworkPreviewSample();
        case "disk":
            return buildHardwarePreviewSample({
                hardware: "disk",
                label: "DISK",
                current: 58,
                secondaryDisplayValue: "430 / 1 TB",
                barLabel: "SSD",
            });
        case "catalog":
            return buildHardwarePreviewSample({
                hardware: "unknown",
                label: "DATA",
                current: 42,
                unit: formatMetricUnit(target.detectedUnit),
                displayValue: "42",
                progress: 0.42,
                secondaryDisplayValue: target.detectedLabel ?? "Metric",
            });
        case "customMetric":
            return buildHardwarePreviewSample({
                hardware: "unknown",
                label: "CUSTOM",
                current: 42,
                unit: "",
                displayValue: "42",
                progress: 0.42,
                secondaryDisplayValue: "Metric",
            });
    }
}

function buildNetworkPreviewSample(): MetricPreviewSample {
    const current = 84;
    const directionIconFragment = renderNetworkDirectionIconFragment({
        direction: "download",
        size: NETWORK_DIRECTION_ICON_SIZE,
    });

    return {
        widgetData: buildWidgetData({
            label: "DOWN",
            current,
            progress: 0.72,
            unit: "MB/s",
            displayValue: current.toString(),
            barLabel: "Net Speed",
        }),
        centerIconFragment: directionIconFragment,
        topIconFragment: directionIconFragment,
        statusIcon: getNetworkDirectionStatusIcon({ direction: "download" }),
    };
}

function buildHardwarePreviewSample(options: HardwarePreviewSampleOptions): MetricPreviewSample {
    const icons = buildMetricViewIcons({
        hardware: options.hardware,
        status: "percentage",
    });

    return {
        widgetData: buildWidgetData({
            label: options.label,
            current: options.current,
            progress: options.progress ?? options.current / 100,
            unit: options.unit ?? "%",
            displayValue: options.displayValue ?? options.current.toFixed(0),
            secondaryDisplayValue: options.secondaryDisplayValue,
            barLabel: options.barLabel,
        }),
        centerIconFragment: icons.centerIconFragment,
        topIconFragment: icons.centerIconFragment,
        statusIcon: icons.statusIcon,
    };
}

function buildWidgetData(options: {
    readonly label: string;
    readonly current: number;
    readonly progress: number;
    readonly unit: string;
    readonly displayValue: string;
    readonly secondaryDisplayValue?: string | undefined;
    readonly barLabel?: string | undefined;
}): WidgetData {
    const fixedScaleMaximum = options.unit === "%" ? 100 : undefined;
    const historyMaximum = fixedScaleMaximum ?? Math.max(1, options.current / Math.max(0.01, options.progress));

    return {
        current: options.current,
        progress: Math.min(Math.max(options.progress, 0), 1),
        history: SAMPLE_HISTORY.map(sample => sample * historyMaximum / 100),
        unit: options.unit,
        label: options.label,
        displayValue: options.displayValue,
        secondaryDisplayValue: options.secondaryDisplayValue,
        barLabel: options.barLabel,
        sparklineScale: fixedScaleMaximum === undefined
            ? undefined
            : {
                mode: "fixed",
                minimumValue: 0,
                maximumValue: fixedScaleMaximum,
            },
        sampleTimestampMilliseconds: PREVIEW_SAMPLE_TIMESTAMP_MILLISECONDS,
    };
}

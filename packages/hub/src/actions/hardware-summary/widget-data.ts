import { buildGpuPowerWidgetData } from "../../metrics/gpu-power-widget-data";
import { buildGpuVramWidgetData } from "../../metrics/gpu-vram-widget-data";
import { buildPercentageWidgetData } from "../../metrics/percentage-widget-data";
import { buildPowerWidgetData } from "../../metrics/power-widget-data";
import { buildTemperatureWidgetData } from "../../metrics/temperature-widget-data";
import type { MetricStoreReader } from "../../runtime/metric-store";
import {
    CPU_POWER_METRIC_KEY,
    CPU_TEMP_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../../runtime/metric-keys";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import type {
    ResolvedCpuHardwareSummaryReading,
    ResolvedGpuHardwareSummaryReading,
    ResolvedHardwareSummaryWidget,
} from "../../settings/resolved-settings";
import type { WidgetData } from "../../view-rendering/widget-data";
import { readHelperBackedWidgetData } from "../shared/helper-backed-widget-data";

/** Stable reading ids used by the summary renderer and PI tests. */
export type HardwareSummaryReadingKind = "usage" | "temperature" | "power" | "vram";

/** Renderer-facing data for one fixed three-reading hardware summary. */
export interface HardwareSummaryWidgetData {
    readonly domain: "cpu" | "gpu";
    readonly primary: HardwareSummaryPrimaryReadingWidgetData;
    readonly secondary: readonly [
        HardwareSummarySecondaryReadingWidgetData,
        HardwareSummarySecondaryReadingWidgetData,
    ];
}

/** Text value shared by primary and secondary hardware summary positions. */
export interface HardwareSummaryReadingWidgetData {
    readonly kind: HardwareSummaryReadingKind;
    readonly label: string;
    /** Unformatted numeric value for render-runner diagnostics; display text remains renderer-facing. */
    readonly diagnosticValue: number;
    readonly displayValue: string;
    readonly unit: string;
    readonly sampleTimestampMilliseconds: number | undefined;
    readonly unavailableDisplayValue: string | undefined;
}

/** Primary reading data; only the primary summary reading exposes gauge progress. */
export interface HardwareSummaryPrimaryReadingWidgetData extends HardwareSummaryReadingWidgetData {
    readonly progress: number;
}

/** Secondary readings are text-only and intentionally do not expose progress. */
export type HardwareSummarySecondaryReadingWidgetData = HardwareSummaryReadingWidgetData;

/** Inputs for adapting metric-store samples into hardware summary widget data. */
export interface HardwareSummaryWidgetDataOptions {
    readonly widget: ResolvedHardwareSummaryWidget;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly helperSampleFreshnessBudgetMilliseconds: number;
}

type HardwareSummaryReadingTriple<TReading> = readonly [TReading, TReading, TReading];

/** Builds renderer-facing data for the three ordered readings in a hardware summary widget. */
export function buildHardwareSummaryWidgetData(options: HardwareSummaryWidgetDataOptions): HardwareSummaryWidgetData {
    if (options.widget.target.domain === "cpu") {
        return assembleHardwareSummaryWidgetData({
            domain: options.widget.target.domain,
            orderedReadings: options.widget.target.orderedReadings,
            readWidgetData: reading => readCpuHardwareSummaryWidgetData({
                reading,
                metrics: options.metrics,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.helperSampleFreshnessBudgetMilliseconds,
            }),
        });
    }

    return assembleHardwareSummaryWidgetData({
        domain: options.widget.target.domain,
        orderedReadings: options.widget.target.orderedReadings,
        readWidgetData: reading => readGpuHardwareSummaryWidgetData({
            reading,
            metrics: options.metrics,
            helperStatus: options.helperStatus,
            sampleFreshnessBudgetMilliseconds: options.helperSampleFreshnessBudgetMilliseconds,
        }),
    });
}

function assembleHardwareSummaryWidgetData<TReading extends { readonly kind: HardwareSummaryReadingKind }>(options: {
    readonly domain: "cpu" | "gpu";
    readonly orderedReadings: HardwareSummaryReadingTriple<TReading>;
    readonly readWidgetData: (reading: TReading) => WidgetData;
}): HardwareSummaryWidgetData {
    const [primaryReading, firstSecondaryReading, secondSecondaryReading] = options.orderedReadings;
    const primaryWidgetData = options.readWidgetData(primaryReading);
    const firstSecondaryWidgetData = options.readWidgetData(firstSecondaryReading);
    const secondSecondaryWidgetData = options.readWidgetData(secondSecondaryReading);

    return {
        domain: options.domain,
        primary: buildPrimaryReadingWidgetData(primaryReading.kind, primaryWidgetData),
        secondary: [
            buildSecondaryReadingWidgetData(firstSecondaryReading.kind, firstSecondaryWidgetData),
            buildSecondaryReadingWidgetData(secondSecondaryReading.kind, secondSecondaryWidgetData),
        ],
    };
}

function readCpuHardwareSummaryWidgetData(options: {
    readonly reading: ResolvedCpuHardwareSummaryReading;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly sampleFreshnessBudgetMilliseconds: number;
}): WidgetData {
    switch (options.reading.kind) {
        case "usage":
            return buildPercentageWidgetData(options.metrics.getWidgetData(
                CPU_USAGE_METRIC_KEY,
                resolveHardwareSummaryReadingLabel(options.reading.kind),
                "%",
                100,
            ));
        case "temperature": {
            const celsiusWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: CPU_TEMP_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "C",
                maxValue: options.reading.maximumCelsius,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildTemperatureWidgetData({
                celsiusWidgetData,
                maximumCelsius: options.reading.maximumCelsius,
                unit: options.reading.unit,
            });
        }
        case "power": {
            const powerWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: CPU_POWER_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "W",
                maxValue: options.reading.maximumWatts,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildPowerWidgetData({
                powerWidgetData,
                maximumPowerWatts: options.reading.maximumWatts,
            });
        }
    }
}

function readGpuHardwareSummaryWidgetData(options: {
    readonly reading: ResolvedGpuHardwareSummaryReading;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly sampleFreshnessBudgetMilliseconds: number;
}): WidgetData {
    switch (options.reading.kind) {
        case "usage": {
            const widgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_USAGE_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "%",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildPercentageWidgetData(widgetData);
        }
        case "temperature": {
            const celsiusWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_TEMP_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "C",
                maxValue: options.reading.maximumCelsius,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildTemperatureWidgetData({
                celsiusWidgetData,
                maximumCelsius: options.reading.maximumCelsius,
                unit: options.reading.unit,
            });
        }
        case "vram": {
            const usedWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_VRAM_USED_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "B",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });
            const totalWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_VRAM_TOTAL_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "B",
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildGpuVramWidgetData(usedWidgetData, totalWidgetData.current);
        }
        case "power": {
            const powerWidgetData = readHelperBackedWidgetData({
                metrics: options.metrics,
                metricKey: GPU_POWER_METRIC_KEY,
                label: resolveHardwareSummaryReadingLabel(options.reading.kind),
                unit: "W",
                maxValue: options.reading.maximumWatts,
                helperStatus: options.helperStatus,
                sampleFreshnessBudgetMilliseconds: options.sampleFreshnessBudgetMilliseconds,
            });

            return buildGpuPowerWidgetData({
                powerWidgetData,
                maximumPowerWatts: options.reading.maximumWatts,
            });
        }
    }
}

function buildPrimaryReadingWidgetData(
    kind: HardwareSummaryReadingKind,
    widgetData: WidgetData,
): HardwareSummaryPrimaryReadingWidgetData {
    return {
        ...buildBaseReadingWidgetData(kind, widgetData),
        progress: widgetData.progress,
    };
}

function buildSecondaryReadingWidgetData(
    kind: HardwareSummaryReadingKind,
    widgetData: WidgetData,
): HardwareSummarySecondaryReadingWidgetData {
    return buildBaseReadingWidgetData(kind, widgetData);
}

function buildBaseReadingWidgetData(
    kind: HardwareSummaryReadingKind,
    widgetData: WidgetData,
): HardwareSummaryReadingWidgetData {
    return {
        kind,
        label: resolveHardwareSummaryReadingLabel(kind),
        diagnosticValue: widgetData.current,
        displayValue: resolveHardwareSummaryDisplayValue(widgetData),
        unit: widgetData.unit,
        sampleTimestampMilliseconds: widgetData.sampleTimestampMilliseconds,
        unavailableDisplayValue: widgetData.unavailableDisplayValue,
    };
}

function resolveHardwareSummaryDisplayValue(widgetData: WidgetData): string {
    if (widgetData.sampleTimestampMilliseconds === undefined) {
        return widgetData.unavailableDisplayValue ?? "N/A";
    }

    return widgetData.displayValue ?? widgetData.current.toFixed(0);
}

function resolveHardwareSummaryReadingLabel(kind: HardwareSummaryReadingKind): string {
    switch (kind) {
        case "usage":
            return "LOAD";
        case "temperature":
            return "TEMP";
        case "power":
            return "PWR";
        case "vram":
            return "VRAM";
    }
}

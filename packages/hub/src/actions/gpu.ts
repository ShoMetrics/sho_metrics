import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { setMetricView } from "../view-updates/runner";
import type { WidgetData } from "../view-rendering/widget-data";
import { formatByteCount } from "../metrics/byte-format";
import { buildGpuPowerWidgetData } from "../metrics/gpu-power-widget-data";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-format";
import { buildTemperatureWidgetData } from "../metrics/temperature-widget-data";
import { logger } from "../logging/logger";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import {
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import type { ResolvedGpuMetricTarget, ResolvedWidgetSettings } from "../settings/resolved-settings";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import type { SingleMetricViewOptions } from "../view-updates/runner";

const log = logger.for("Action:GPU");

/** GPU action. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.gpu })
export class Gpu extends MetricAction {
    protected readonly actionKind = "gpu";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const gpuTarget = readResolvedMetricTarget(settings, "gpu");
        return resolveGpuMetricSubscriptionKeys(gpuTarget);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const gpuTarget = readResolvedMetricTarget(settings, "gpu");
        const metrics = this.getMetricReader(event);

        this.publishGpuPowerRuntimeMaximum(event, gpuTarget, metrics);

        setMetricView(buildGpuViewOptions({
            event,
            settings,
            target: gpuTarget,
            metrics,
        }));
    }

    private publishGpuPowerRuntimeMaximum(
        event: WillAppearEvent,
        target: ResolvedGpuMetricTarget,
        metrics: MetricStoreReader,
    ): void {
        if (target.reading.kind !== "power") {
            return;
        }

        const nextMaximum = resolveRuntimeGpuPowerMaximumWatts(metrics);
        if (nextMaximum === undefined) {
            return;
        }

        this.updateRuntimeCache(event, {
            runtimeMaximumGpuPowerWatts: nextMaximum,
        }).catch(error => {
            log.error(() => `Failed to publish runtime GPU power maximum: ${String(error)}`);
        });
    }
}

const GPU_SAMPLE_STALE_MS = 7000;

export function resolveGpuMetricSubscriptionKeys(target: ResolvedGpuMetricTarget): readonly string[] {
    switch (target.reading.kind) {
        case "usage":
            return [GPU_USAGE_METRIC_KEY, GPU_MODEL_METRIC_KEY];
        case "temperature":
            return [GPU_TEMP_METRIC_KEY];
        case "vram":
            return [GPU_VRAM_USED_METRIC_KEY, GPU_VRAM_TOTAL_METRIC_KEY];
        case "power":
            return [GPU_POWER_METRIC_KEY, GPU_POWER_LIMIT_METRIC_KEY];
    }
}

function buildGpuViewOptions(options: {
    event: WillAppearEvent;
    settings: ResolvedWidgetSettings;
    target: ResolvedGpuMetricTarget;
    metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    const baseOptions = {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
    };

    switch (options.target.reading.kind) {
        case "temperature":
            return {
                ...baseOptions,
                metricKey: GPU_TEMP_METRIC_KEY,
                widgetData: buildTemperatureWidgetData({
                    celsiusWidgetData: getGpuWidgetData(
                        options.metrics,
                        GPU_TEMP_METRIC_KEY,
                        ARC_GAUGE_LABELS.gpu,
                        "C",
                        options.target.reading.maximumCelsius,
                    ),
                    maximumCelsius: options.target.reading.maximumCelsius,
                    unit: options.target.reading.unit,
                }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "temperature" }),
            };
        case "vram":
            return {
                ...baseOptions,
                metricKey: GPU_VRAM_USED_METRIC_KEY,
                widgetData: buildGpuVramWidgetData(
                    getGpuWidgetData(options.metrics, GPU_VRAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB"),
                    getGpuWidgetData(options.metrics, GPU_VRAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB").current,
                ),
                ...buildMetricViewIcons({ hardware: "gpu", status: "memory" }),
            };
        case "power":
            return {
                ...baseOptions,
                metricKey: GPU_POWER_METRIC_KEY,
                widgetData: buildGpuPowerWidgetData({
                    powerWidgetData: getGpuWidgetData(
                        options.metrics,
                        GPU_POWER_METRIC_KEY,
                        ARC_GAUGE_LABELS.gpu,
                        "W",
                        options.target.reading.maximumWatts,
                    ),
                    maximumPowerWatts: options.target.reading.maximumWatts,
                }),
                ...buildMetricViewIcons({ hardware: "gpu", status: "power" }),
            };
        case "usage": {
            const data = getGpuWidgetData(options.metrics, GPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "%");

            return {
                ...baseOptions,
                metricKey: GPU_USAGE_METRIC_KEY,
                widgetData: {
                    ...buildGpuUsageWidgetData(data),
                    secondaryDisplayValue: data.sampleTimestampMilliseconds != null
                        ? formatCompactHardwareModelLabel(
                            options.metrics.getTextValue(GPU_MODEL_METRIC_KEY),
                            "gpu",
                        )
                        : undefined,
                },
                ...buildMetricViewIcons({ hardware: "gpu", status: "percentage" }),
            };
        }
    }
}

function resolveRuntimeGpuPowerMaximumWatts(metrics: MetricStoreReader): number | undefined {
    const powerLimitWidgetData = metrics.getWidgetData(
        GPU_POWER_LIMIT_METRIC_KEY,
        ARC_GAUGE_LABELS.gpu,
        "W",
    );

    if (
        powerLimitWidgetData.sampleTimestampMilliseconds != null
        && powerLimitWidgetData.current > 0
    ) {
        return Math.ceil(powerLimitWidgetData.current);
    }

    const powerWidgetData = metrics.getWidgetData(
        GPU_POWER_METRIC_KEY,
        ARC_GAUGE_LABELS.gpu,
        "W",
    );
    if (
        powerWidgetData.sampleTimestampMilliseconds != null
        && powerWidgetData.current > 0
    ) {
        return Math.ceil(powerWidgetData.current * 1.1);
    }

    return undefined;
}

function getGpuWidgetData(
    metrics: MetricStoreReader,
    metricKey: string,
    label: string,
    unit: string,
    maxValue = 100,
): WidgetData {
    const widgetData = metrics.getWidgetData(
        metricKey,
        label,
        unit,
        maxValue,
    );

    if (isFreshGpuWidgetData(widgetData)) {
        return widgetData;
    }

    const {
        displayValue: ignoredDisplayValue,
        secondaryDisplayValue: ignoredSecondaryDisplayValue,
        sampleTimestampMilliseconds: ignoredSampleTimestampMilliseconds,
        ...baseWidgetData
    } = widgetData;

    void ignoredDisplayValue;
    void ignoredSecondaryDisplayValue;
    void ignoredSampleTimestampMilliseconds;

    return {
        ...baseWidgetData,
        current: 0,
        progress: 0,
        history: [],
    };
}

function isFreshGpuWidgetData(widgetData: WidgetData): boolean {
    if (widgetData.sampleTimestampMilliseconds == null) {
        return false;
    }

    return Date.now() - widgetData.sampleTimestampMilliseconds <= GPU_SAMPLE_STALE_MS;
}

export function buildGpuUsageWidgetData(widgetData: WidgetData): WidgetData {
    return {
        ...widgetData,
        displayValue: widgetData.current.toFixed(0),
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
    };
}

export function buildGpuVramWidgetData(used: WidgetData, totalMegabytes: number): WidgetData {
    const safeTotalMegabytes = totalMegabytes > 0 ? totalMegabytes : 1;
    const usedAndTotalText = formatUsedAndTotalMegabytes(used.current, safeTotalMegabytes);

    return {
        current: (used.current / safeTotalMegabytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalMegabytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalMegabytes) * 100),
        unit: "%",
        label: ARC_GAUGE_LABELS.vram,
        displayValue: ((used.current / safeTotalMegabytes) * 100).toFixed(0),
        secondaryDisplayValue: usedAndTotalText,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: 100,
        },
        sampleTimestampMilliseconds: used.sampleTimestampMilliseconds,
    };
}

function formatUsedAndTotalMegabytes(usedMegabytes: number, totalMegabytes: number): string {
    const binaryBase = 1024;
    const usedBytes = usedMegabytes * binaryBase * binaryBase;
    const totalBytes = totalMegabytes * binaryBase * binaryBase;
    const formattedUsedBytes = formatByteCount({
        bytes: usedBytes,
        base: binaryBase,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 3,
    });
    const formattedTotalBytes = formatByteCount({
        bytes: totalBytes,
        base: binaryBase,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 3,
    });
    const usedText = formattedUsedBytes.unit === formattedTotalBytes.unit
        ? formattedUsedBytes.value
        : `${formattedUsedBytes.value} ${formattedUsedBytes.unit}`;

    return `${usedText} / ${formattedTotalBytes.value} ${formattedTotalBytes.unit}`;
}

import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import type { WidgetData } from "../rendering/widget-data";
import { formatByteCount } from "../metrics/byte-format";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-format";
import { buildGpuPowerWidgetData, resolveMaximumGpuPowerWatts } from "../metrics/gpu-power-widget-data";
import {
    buildTemperatureWidgetData,
    resolveMaximumTemperatureCelsius,
    resolveTemperatureUnit,
} from "../metrics/temperature-widget-data";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import {
    GPU_METRIC_KEYS,
    GPU_MODEL_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_USAGE_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";

/**
 * Base class for GPU-related actions.
 * Treats missing and stale GPU samples as render-only no-data state.
 */
abstract class GpuBaseAction extends MetricAction {
    protected override getMetricKeys(): readonly string[] {
        return GPU_METRIC_KEYS;
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        this.updateGpuDisplay(event);
    }

    protected getGpuWidgetData(metricKey: string, label: string, unit: string, maxValue = 100): WidgetData {
        const widgetData = metricStore.getWidgetData(metricKey, label, unit, maxValue);

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

    protected abstract updateGpuDisplay(event: WillAppearEvent): void;
}

@action({ UUID: "com.ez.sho-metrics.gpu-usage" })
export class GpuUsage extends GpuBaseAction {
    protected readonly actionKind = "gpu-usage";

    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const data = this.getGpuWidgetData(GPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "%");

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: GPU_USAGE_METRIC_KEY,
            widgetData: {
                ...buildGpuUsageWidgetData(data),
                secondaryDisplayValue: data.sampleTimestampMilliseconds != null
                    ? formatCompactHardwareModelLabel(metricStore.getTextValue(GPU_MODEL_METRIC_KEY), "gpu")
                    : undefined,
            },
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "percentage" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-temp" })
export class GpuTemp extends GpuBaseAction {
    protected readonly actionKind = "gpu-temp";

    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const celsiusWidgetData = this.getGpuWidgetData(GPU_TEMP_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "C");
        const widgetData = buildTemperatureWidgetData({
            celsiusWidgetData,
            maximumCelsius: resolveMaximumTemperatureCelsius(settings.local.maximumTemperatureCelsius),
            unit: resolveTemperatureUnit(settings.local.temperatureUnit),
        });

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: GPU_TEMP_METRIC_KEY,
            widgetData,
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "temperature" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-vram" })
export class GpuVram extends GpuBaseAction {
    protected readonly actionKind = "gpu-vram";

    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const used = this.getGpuWidgetData(GPU_VRAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");
        const total = this.getGpuWidgetData(GPU_VRAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: GPU_VRAM_USED_METRIC_KEY,
            widgetData: buildGpuVramWidgetData(used, total.current),
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "percentage" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-power" })
export class GpuPower extends GpuBaseAction {
    protected readonly actionKind = "gpu-power";

    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const powerWidgetData = this.getGpuWidgetData(GPU_POWER_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "W");
        const powerLimitWidgetData = this.getGpuWidgetData(GPU_POWER_LIMIT_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "W");
        const maximumPowerWatts = resolveMaximumGpuPowerWatts({
            customMaximumPowerWatts: settings.local.maximumGpuPowerWatts,
            automaticMaximumPowerWatts: powerLimitWidgetData.current,
        });

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: GPU_POWER_METRIC_KEY,
            widgetData: buildGpuPowerWidgetData({ powerWidgetData, maximumPowerWatts }),
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "power" }),
        });
    }
}

const GPU_SAMPLE_STALE_MS = 7000;

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

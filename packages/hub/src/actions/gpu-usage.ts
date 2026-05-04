import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import type { WidgetData } from "../rendering/widget-data";
import type { SettingValue } from "./metric-visual-settings";
import { formatBytes } from "../metrics/byte-display";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-label";
import { buildGpuPowerWidgetData, resolveMaximumGpuPowerWatts } from "../metrics/gpu-power-display";
import {
    buildTemperatureWidgetData,
    resolveMaximumTemperatureCelsius,
    resolveTemperatureUnit,
} from "../metrics/temperature-display";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";

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
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const data = this.getGpuWidgetData(GPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "%");

        setSingleMetricDisplay({
            event,
            metricKey: GPU_USAGE_METRIC_KEY,
            widgetData: {
                ...data,
                sparklineScale: {
                    mode: "fixed",
                    minimumValue: 0,
                    maximumValue: 100,
                },
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
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = event.payload.settings as GpuTemperatureSettings;
        const celsiusWidgetData = this.getGpuWidgetData(GPU_TEMP_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "C");
        const widgetData = buildTemperatureWidgetData({
            celsiusWidgetData,
            maximumCelsius: resolveMaximumTemperatureCelsius(settings.maximumTemperatureCelsius),
            unit: resolveTemperatureUnit(settings.temperatureUnit),
        });

        setSingleMetricDisplay({
            event,
            metricKey: GPU_TEMP_METRIC_KEY,
            widgetData,
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "temperature" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-vram" })
export class GpuVram extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const used = this.getGpuWidgetData(GPU_VRAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");
        const total = this.getGpuWidgetData(GPU_VRAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");

        setSingleMetricDisplay({
            event,
            metricKey: GPU_VRAM_USED_METRIC_KEY,
            widgetData: buildGpuVramWidgetData(used, total.current),
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "percentage" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-power" })
export class GpuPower extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = event.payload.settings as GpuPowerSettings;
        const powerWidgetData = this.getGpuWidgetData(GPU_POWER_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "W");
        const powerLimitWidgetData = this.getGpuWidgetData(GPU_POWER_LIMIT_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "W");
        const maximumPowerWatts = resolveMaximumGpuPowerWatts({
            customMaximumPowerWatts: settings.maximumGpuPowerWatts,
            automaticMaximumPowerWatts: powerLimitWidgetData.current,
        });

        setSingleMetricDisplay({
            event,
            metricKey: GPU_POWER_METRIC_KEY,
            widgetData: buildGpuPowerWidgetData({ powerWidgetData, maximumPowerWatts }),
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "power" }),
        });
    }
}

const GPU_USAGE_METRIC_KEY = "gpu.usage_percent";
const GPU_MODEL_METRIC_KEY = "gpu.model";
const GPU_TEMP_METRIC_KEY = "gpu.temp";
const GPU_VRAM_USED_METRIC_KEY = "gpu.vram_used";
const GPU_VRAM_TOTAL_METRIC_KEY = "gpu.vram_total";
const GPU_POWER_METRIC_KEY = "gpu.power";
const GPU_POWER_LIMIT_METRIC_KEY = "gpu.power_limit";
const GPU_SAMPLE_STALE_MS = 7000;
const GPU_METRIC_KEYS = [
    GPU_USAGE_METRIC_KEY,
    GPU_MODEL_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
    GPU_POWER_LIMIT_METRIC_KEY,
];

function isFreshGpuWidgetData(widgetData: WidgetData): boolean {
    if (widgetData.sampleTimestampMilliseconds == null) {
        return false;
    }

    return Date.now() - widgetData.sampleTimestampMilliseconds <= GPU_SAMPLE_STALE_MS;
}

interface GpuTemperatureSettings {
    maximumTemperatureCelsius?: SettingValue;
    temperatureUnit?: SettingValue;
}

interface GpuPowerSettings {
    maximumGpuPowerWatts?: SettingValue;
}

function buildGpuVramWidgetData(used: WidgetData, totalMegabytes: number): WidgetData {
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
    const formattedUsedBytes = formatBytes({
        bytes: usedBytes,
        base: binaryBase,
        maximumDisplayDigits: 3,
        minimumUnitIndex: 3,
    });
    const formattedTotalBytes = formatBytes({
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

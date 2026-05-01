import { action, WillAppearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import type { WidgetData } from "../rendering/widget-data";
import type { SettingValue } from "./metric-visual-settings";
import {
    buildTemperatureWidgetData,
    resolveMaximumTemperatureCelsius,
    resolveTemperatureUnit,
} from "../metrics/temperature-display";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";

/**
 * Base class for GPU-related actions.
 * Handles the null-GPU case by showing "N/A".
 */
abstract class GpuBaseAction extends MetricAction {
    protected override getMetricKeys(): readonly string[] {
        return GPU_METRIC_KEYS;
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const gpuUsage = metricStore.getWidgetData(GPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "%");
        const hasGpu = gpuUsage.history.length > 0;

        if (!hasGpu) {
            if (event.action.isDial()) {
                event.action.setFeedback({ title: "GPU", value: "N/A" });
            } else {
                event.action.setTitle("GPU\nN/A");
            }
            return;
        }

        this.updateGpuDisplay(event);
    }

    protected abstract updateGpuDisplay(event: WillAppearEvent): void;
}

@action({ UUID: "com.ez.sho-metrics.gpu-usage" })
export class GpuUsage extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const data = metricStore.getWidgetData(GPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "%");

        setSingleMetricDisplay({
            event,
            metricKey: GPU_USAGE_METRIC_KEY,
            widgetData: data,
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "percentage" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-temp" })
export class GpuTemp extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const settings = event.payload.settings as GpuTemperatureSettings;
        const celsiusWidgetData = metricStore.getWidgetData(GPU_TEMP_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "C");
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
        const used = metricStore.getWidgetData(GPU_VRAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");
        const total = metricStore.getWidgetData(GPU_VRAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.vram, "MB");

        setSingleMetricDisplay({
            event,
            metricKey: GPU_VRAM_USED_METRIC_KEY,
            widgetData: buildGpuVramWidgetData(used, total.current),
            ...buildMetricDisplayIcons({ hardware: "gpu", status: "memory" }),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-power" })
export class GpuPower extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const data = metricStore.getWidgetData(GPU_POWER_METRIC_KEY, ARC_GAUGE_LABELS.gpu, "W");
        const valueText = `${data.current.toFixed(0)}W`;

        if (event.action.isDial()) {
            const updateStartTimestampMilliseconds = Date.now();
            event.action.setFeedback({ title: "GPU Power", value: valueText }).then(() => {
                logTextMetricDebug("gpu-power", GPU_POWER_METRIC_KEY, data, updateStartTimestampMilliseconds);
            }).catch(error => {
                streamDeck.logger.error(`[GpuPower] Failed to set feedback: ${String(error)}`);
            });
            return;
        }

        const updateStartTimestampMilliseconds = Date.now();
        event.action.setTitle(`GPU\n${valueText}`).then(() => {
            logTextMetricDebug("gpu-power", GPU_POWER_METRIC_KEY, data, updateStartTimestampMilliseconds);
        }).catch(error => {
            streamDeck.logger.error(`[GpuPower] Failed to set title: ${String(error)}`);
        });
    }
}

const GPU_USAGE_METRIC_KEY = "gpu.usage_percent";
const GPU_TEMP_METRIC_KEY = "gpu.temp";
const GPU_VRAM_USED_METRIC_KEY = "gpu.vram_used";
const GPU_VRAM_TOTAL_METRIC_KEY = "gpu.vram_total";
const GPU_POWER_METRIC_KEY = "gpu.power";
const GPU_METRIC_KEYS = [
    GPU_USAGE_METRIC_KEY,
    GPU_TEMP_METRIC_KEY,
    GPU_VRAM_USED_METRIC_KEY,
    GPU_VRAM_TOTAL_METRIC_KEY,
    GPU_POWER_METRIC_KEY,
];

interface GpuTemperatureSettings {
    maximumTemperatureCelsius?: SettingValue;
    temperatureUnit?: SettingValue;
}

function buildGpuVramWidgetData(used: WidgetData, totalMegabytes: number): WidgetData {
    const safeTotalMegabytes = totalMegabytes > 0 ? totalMegabytes : 1;

    return {
        current: (used.current / safeTotalMegabytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalMegabytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalMegabytes) * 100),
        unit: "%",
        label: ARC_GAUGE_LABELS.vram,
    };
}

function logTextMetricDebug(
    actionName: string,
    metricKey: string,
    data: WidgetData,
    updateStartTimestampMilliseconds: number,
): void {
    const currentTimestampMilliseconds = Date.now();
    const sampleAgeMilliseconds = data.sampleTimestampMilliseconds
        ? currentTimestampMilliseconds - data.sampleTimestampMilliseconds
        : "unknown";

    streamDeck.logger.debug([
        "[TextMetricDisplay]",
        `action=${actionName}`,
        `metricKey=${metricKey}`,
        `value=${data.current.toFixed(2)}`,
        `sampleAgeMs=${sampleAgeMilliseconds}`,
        `sdkPromiseMs=${currentTimestampMilliseconds - updateStartTimestampMilliseconds}`,
    ].join(" "));
}

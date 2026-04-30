import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import type { WidgetData } from "../rendering/widget-data";

/**
 * Base class for GPU-related actions.
 * Handles the null-GPU case by showing "N/A".
 */
abstract class GpuBaseAction extends MetricAction {
    protected onMetricsUpdate(event: WillAppearEvent): void {
        const gpuUsage = metricStore.getWidgetData("gpu.usage_percent", "GPU", "%");
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
        const data = metricStore.getWidgetData("gpu.usage_percent", "GPU Usage", "%");

        if (event.action.isDial()) {
            event.action.setFeedback({ title: "GPU Usage", value: `${data.current.toFixed(0)}%` });
            return;
        }

        setSingleMetricDisplay({
            event,
            widgetData: data,
            centerIconFragment: renderGpuIconFragment(),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-temp" })
export class GpuTemp extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const data = metricStore.getWidgetData("gpu.temp", "GPU Temp", "C");
        const valueText = `${data.current.toFixed(0)}C`;

        if (event.action.isDial()) {
            event.action.setFeedback({ title: "GPU Temp", value: valueText });
            return;
        }

        event.action.setTitle(`GPU\n${valueText}`);
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-vram" })
export class GpuVram extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const used = metricStore.getWidgetData("gpu.vram_used", "VRAM", "MB");
        const total = metricStore.getWidgetData("gpu.vram_total", "VRAM", "MB");
        const usedGigabytes = (used.current / 1024).toFixed(1);
        const totalGigabytes = (total.current / 1024).toFixed(0);

        if (event.action.isDial()) {
            event.action.setFeedback({ title: "GPU VRAM", value: `${usedGigabytes}/${totalGigabytes}G` });
            return;
        }

        setSingleMetricDisplay({
            event,
            widgetData: buildGpuVramWidgetData(used, total.current),
            centerIconFragment: renderMemoryIconFragment(),
        });
    }
}

@action({ UUID: "com.ez.sho-metrics.gpu-power" })
export class GpuPower extends GpuBaseAction {
    protected updateGpuDisplay(event: WillAppearEvent): void {
        const data = metricStore.getWidgetData("gpu.power", "GPU Power", "W");
        const valueText = `${data.current.toFixed(0)}W`;

        if (event.action.isDial()) {
            event.action.setFeedback({ title: "GPU Power", value: valueText });
            return;
        }

        event.action.setTitle(`GPU\n${valueText}`);
    }
}

function buildGpuVramWidgetData(used: WidgetData, totalMegabytes: number): WidgetData {
    const safeTotalMegabytes = totalMegabytes > 0 ? totalMegabytes : 1;

    return {
        current: (used.current / safeTotalMegabytes) * 100,
        progress: Math.min(Math.max(used.current / safeTotalMegabytes, 0), 1),
        history: used.history.map((historyValue) => (historyValue / safeTotalMegabytes) * 100),
        unit: "%",
        label: "VRAM",
    };
}

function renderGpuIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-26" y="-16" width="52" height="32" rx="6" stroke-width="5" />
            <circle cx="-10" cy="0" r="7" stroke-width="4" opacity="0.8" />
            <circle cx="10" cy="0" r="7" stroke-width="4" opacity="0.8" />
            <path d="M -16 22 L 16 22 M 0 16 L 0 22" stroke-width="5" />
        </g>
    `;
}

function renderMemoryIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-24" y="-16" width="48" height="32" rx="5" stroke-width="5" />
            <path d="M -12 -6 L -12 6 M 0 -6 L 0 6 M 12 -6 L 12 6" stroke-width="4" opacity="0.78" />
            <path d="M -18 -24 L -18 -16 M -6 -24 L -6 -16 M 6 -24 L 6 -16 M 18 -24 L 18 -16" stroke-width="4" />
            <path d="M -18 16 L -18 24 M -6 16 L -6 24 M 6 16 L 6 24 M 18 16 L 18 24" stroke-width="4" />
        </g>
    `;
}

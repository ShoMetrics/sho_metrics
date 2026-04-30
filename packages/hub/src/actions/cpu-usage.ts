import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";

/**
 * CPU Usage action with full theming support.
 * User can choose graphic type (circular, dashed-line, linear),
 * style (flat, cupertino-glass), and color mode (solid, threshold).
 */
@action({ UUID: "com.ez.sho-metrics.cpu-usage" })
export class CpuUsage extends MetricAction {
    protected onMetricsUpdate(event: WillAppearEvent): void {
        const widgetData = metricStore.getWidgetData("cpu.usage_percent", "CPU", "%", 100);
        setSingleMetricDisplay({
            event,
            widgetData,
            centerIconFragment: renderCpuIconFragment(),
        });
    }
}

function renderCpuIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-18" y="-18" width="36" height="36" rx="7" stroke-width="6" />
            <rect x="-8" y="-8" width="16" height="16" rx="3" stroke-width="4" opacity="0.72" />
            <path d="M -26 -12 L -18 -12 M -26 0 L -18 0 M -26 12 L -18 12" stroke-width="4" />
            <path d="M 18 -12 L 26 -12 M 18 0 L 26 0 M 18 12 L 26 12" stroke-width="4" />
            <path d="M -12 -26 L -12 -18 M 0 -26 L 0 -18 M 12 -26 L 12 -18" stroke-width="4" />
            <path d="M -12 18 L -12 26 M 0 18 L 0 26 M 12 18 L 12 26" stroke-width="4" />
        </g>
    `;
}

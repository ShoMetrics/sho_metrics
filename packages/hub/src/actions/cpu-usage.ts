import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";

/**
 * CPU Usage action with full theming support.
 * User can choose graphic type (circular, dashed-line, linear),
 * style (flat, cupertino-glass), and color mode (solid, threshold).
 */
@action({ UUID: "com.ez.sho-metrics.cpu-usage" })
export class CpuUsage extends MetricAction {
    protected override getMetricKeys(): readonly string[] {
        return [CPU_USAGE_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const widgetData = metricStore.getWidgetData(CPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.cpu, "%", 100);
        setSingleMetricDisplay({
            event,
            metricKey: CPU_USAGE_METRIC_KEY,
            widgetData,
            ...buildMetricDisplayIcons({ hardware: "cpu", status: "percentage" }),
        });
    }
}

const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";

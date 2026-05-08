import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-label";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import type { WidgetData } from "../rendering/widget-data";

/**
 * CPU Usage action with full theming support.
 * User can choose graphic type (circular, dashed-line, linear),
 * style (flat, cupertino-glass), and color mode (solid, threshold).
 */
@action({ UUID: "com.ez.sho-metrics.cpu-usage" })
export class CpuUsage extends MetricAction {
    protected readonly actionKind = "cpu-usage";

    protected override getMetricKeys(): readonly string[] {
        return [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const widgetData = metricStore.getWidgetData(CPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.cpu, "%", 100);

        setSingleMetricDisplay({
            event,
            resolvedSettings: this.resolveSettings(event),
            metricKey: CPU_USAGE_METRIC_KEY,
            widgetData: {
                ...buildCpuUsageWidgetData(widgetData),
                secondaryDisplayValue: formatCompactHardwareModelLabel(
                    metricStore.getTextValue(CPU_MODEL_METRIC_KEY),
                    "cpu",
                ),
            },
            ...buildMetricDisplayIcons({ hardware: "cpu", status: "percentage" }),
        });
    }
}

const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
const CPU_MODEL_METRIC_KEY = "cpu.model";

export function buildCpuUsageWidgetData(widgetData: WidgetData): WidgetData {
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

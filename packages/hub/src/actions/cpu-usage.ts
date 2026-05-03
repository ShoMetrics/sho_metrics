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
        return [CPU_USAGE_METRIC_KEY, CPU_BASE_FREQUENCY_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const widgetData = metricStore.getWidgetData(CPU_USAGE_METRIC_KEY, ARC_GAUGE_LABELS.cpu, "%", 100);
        const baseFrequencyWidgetData = metricStore.getWidgetData(CPU_BASE_FREQUENCY_METRIC_KEY, ARC_GAUGE_LABELS.cpu, "GHz");

        setSingleMetricDisplay({
            event,
            metricKey: CPU_USAGE_METRIC_KEY,
            widgetData: {
                ...widgetData,
                displayValue: widgetData.current.toFixed(0),
                secondaryDisplayValue: resolveCpuBaseFrequencyDisplayText(baseFrequencyWidgetData),
            },
            ...buildMetricDisplayIcons({ hardware: "cpu", status: "percentage" }),
        });
    }
}

const CPU_USAGE_METRIC_KEY = "cpu.usage_percent";
const CPU_BASE_FREQUENCY_METRIC_KEY = "cpu.base_frequency";

function resolveCpuBaseFrequencyDisplayText(
    baseFrequencyWidgetData: ReturnType<typeof metricStore.getWidgetData>,
): string | undefined {
    if (baseFrequencyWidgetData.sampleTimestampMilliseconds != null && baseFrequencyWidgetData.current > 0) {
        return `base: ${baseFrequencyWidgetData.current.toFixed(2)} GHz`;
    }

    return undefined;
}

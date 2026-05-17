import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setMetricView } from "../metric-view-runner/runner";
import { formatCompactHardwareModelLabel } from "../metrics/hardware-model-format";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import type { WidgetData } from "../rendering/widget-data";
import { CPU_MODEL_METRIC_KEY, CPU_USAGE_METRIC_KEY } from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";

/** CPU action with full theming support. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.cpu })
export class Cpu extends MetricAction {
    protected readonly actionKind = "cpu";

    protected override getMetricKeys(): readonly string[] {
        return [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const metrics = this.getMetricReader(event);
        readResolvedMetricTarget(settings, "cpu");

        const widgetData = metrics.getWidgetData(
            CPU_USAGE_METRIC_KEY,
            ARC_GAUGE_LABELS.cpu,
            "%",
            100,
        );

        setMetricView({
            event,
            resolvedSettings: settings.widget.slot.appearance,
            metricKey: CPU_USAGE_METRIC_KEY,
            widgetData: {
                ...buildCpuUsageWidgetData(widgetData),
                secondaryDisplayValue: formatCompactHardwareModelLabel(
                    metrics.getTextValue(CPU_MODEL_METRIC_KEY),
                    "cpu",
                ),
            },
            ...buildMetricViewIcons({ hardware: "cpu", status: "percentage" }),
        });
    }
}

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

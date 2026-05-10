import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import { buildMemoryUsageWidgetData } from "../metrics/storage-widget-data";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import { RAM_TOTAL_METRIC_KEY, RAM_USED_METRIC_KEY } from "../runtime/metric-keys";

@action({ UUID: "com.ez.sho-metrics.ram" })
export class RamUsage extends MetricAction {
    protected readonly actionKind = "ram";

    protected override getMetricKeys(): readonly string[] {
        return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const usedBytesWidgetData = metricStore.getWidgetData(RAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.ram, "B");
        const totalBytesWidgetData = metricStore.getWidgetData(RAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.ram, "B");

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.appearance,
            metricKey: RAM_USED_METRIC_KEY,
            widgetData: buildMemoryUsageWidgetData({
                usedBytesWidgetData,
                totalBytes: totalBytesWidgetData.current,
                label: ARC_GAUGE_LABELS.ram,
            }),
            ...buildMetricDisplayIcons({ hardware: "memory", status: "percentage" }),
        });
    }
}


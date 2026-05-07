import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { metricStore } from "../runtime/metric-store";
import { setSingleMetricDisplay } from "./single-metric-display";
import { buildMemoryUsageWidgetData } from "../metrics/storage-display";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import { resolveActionSettings } from "./action-settings-resolver";

@action({ UUID: "com.ez.sho-metrics.ram" })
export class RamUsage extends MetricAction {
    protected override getMetricKeys(): readonly string[] {
        return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const usedBytesWidgetData = metricStore.getWidgetData(RAM_USED_METRIC_KEY, ARC_GAUGE_LABELS.ram, "B");
        const totalBytesWidgetData = metricStore.getWidgetData(RAM_TOTAL_METRIC_KEY, ARC_GAUGE_LABELS.ram, "B");

        setSingleMetricDisplay({
            event,
            resolvedSettings: resolveActionSettings(
                event.payload.settings as Record<string, unknown>,
                "ram",
            ),
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

const RAM_USED_METRIC_KEY = "ram.used";
const RAM_TOTAL_METRIC_KEY = "ram.total";

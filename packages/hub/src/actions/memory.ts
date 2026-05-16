import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setSingleMetricDisplay } from "../metric-view-runner/runner";
import { buildMemoryUsageWidgetData } from "../metrics/storage-widget-data";
import { buildMetricDisplayIcons } from "../widgets/icons/metric-display-icons";
import { ARC_GAUGE_LABELS } from "../widgets/primitives/arc-gauge-label";
import { RAM_TOTAL_METRIC_KEY, RAM_USED_METRIC_KEY } from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.memory })
export class Memory extends MetricAction {
    protected readonly actionKind = "memory";

    protected override getMetricKeys(): readonly string[] {
        return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const metrics = this.getMetricReader(event);
        readResolvedMetricTarget(settings, "memory");

        const usedBytesWidgetData = metrics.getWidgetData(
            RAM_USED_METRIC_KEY,
            ARC_GAUGE_LABELS.ram,
            "B",
        );
        const totalBytesWidgetData = metrics.getWidgetData(
            RAM_TOTAL_METRIC_KEY,
            ARC_GAUGE_LABELS.ram,
            "B",
        );

        setSingleMetricDisplay({
            event,
            resolvedSettings: settings.widget.slot.appearance,
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


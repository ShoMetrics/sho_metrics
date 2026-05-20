import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setMetricView } from "../view-updates/runner";
import { buildMemoryUsageWidgetData } from "../metrics/storage-widget-data";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { PROGRESS_CIRCLE_LABELS } from "../widgets/primitives/progress-circle-label";
import { RAM_TOTAL_METRIC_KEY, RAM_USED_METRIC_KEY } from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import type { MetricCollectionMode } from "./metric-action";

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.memory })
export class Memory extends MetricAction {
    protected readonly actionKind = "memory";

    protected override getMetricKeys(): readonly string[] {
        return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
    }

    protected override getMetricCollectionMode(): MetricCollectionMode {
        return "background";
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const metrics = this.getMetricReader(event);
        readResolvedMetricTarget(settings, "memory");

        const usedBytesWidgetData = metrics.getWidgetData(
            RAM_USED_METRIC_KEY,
            PROGRESS_CIRCLE_LABELS.ram,
            "B",
        );
        const totalBytesWidgetData = metrics.getWidgetData(
            RAM_TOTAL_METRIC_KEY,
            PROGRESS_CIRCLE_LABELS.ram,
            "B",
        );

        setMetricView({
            event,
            resolvedSettings: settings.widget.slot.appearance,
            metricKey: RAM_USED_METRIC_KEY,
            widgetData: buildMemoryUsageWidgetData({
                usedBytesWidgetData,
                totalBytes: totalBytesWidgetData.current,
                label: PROGRESS_CIRCLE_LABELS.ram,
            }),
            ...buildMetricViewIcons({ hardware: "memory", status: "percentage" }),
        });
    }
}


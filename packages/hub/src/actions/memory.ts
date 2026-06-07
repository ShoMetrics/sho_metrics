import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setMetricView } from "../view-updates/runner";
import type { MetricStoreReader } from "../runtime/metric-store";
import { buildMemoryUsageWidgetData } from "../metrics/storage-widget-data";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { PROGRESS_CIRCLE_LABELS } from "../widgets/primitives/progress-circle-label";
import { RAM_TOTAL_METRIC_KEY, RAM_USED_METRIC_KEY } from "../runtime/metric-keys";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedMemoryMetricTarget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import type { SingleMetricViewOptions } from "../view-updates/runner";

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.memory })
export class Memory extends MetricAction {
    protected readonly actionKind = "memory";

    protected override getMetricKeys(): readonly string[] {
        return [RAM_USED_METRIC_KEY, RAM_TOTAL_METRIC_KEY];
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "memory");

        setMetricView(buildMemoryMetricViewOptions({
            event,
            settings,
            target,
            metrics: this.getMetricReader(event),
        }));
    }
}

export function buildMemoryMetricViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedMemoryMetricTarget;
    readonly metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    void options.target;
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const usedBytesWidgetData = options.metrics.getWidgetData(
        RAM_USED_METRIC_KEY,
        PROGRESS_CIRCLE_LABELS.ram,
        "B",
    );
    const totalBytesWidgetData = options.metrics.getWidgetData(
        RAM_TOTAL_METRIC_KEY,
        PROGRESS_CIRCLE_LABELS.ram,
        "B",
    );

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey: RAM_USED_METRIC_KEY,
        widgetData: buildMemoryUsageWidgetData({
            usedBytesWidgetData,
            totalBytes: totalBytesWidgetData.current,
            label: PROGRESS_CIRCLE_LABELS.ram,
        }),
        ...buildMetricViewIcons({ hardware: "memory", status: "percentage" }),
    };
}


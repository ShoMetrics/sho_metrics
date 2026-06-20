import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../runtime/metric-store";
import { SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../runtime/metric-keys";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedSystemMetricTarget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import type { SingleMetricViewOptions } from "../view-updates/runner";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";

export function buildSystemViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedSystemMetricTarget;
    readonly metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    void options.target;
    const widget = requireResolvedSingleMetricWidget(options.settings);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey: SYSTEM_BATTERY_PERCENT_METRIC_KEY,
        widgetData: options.metrics.getWidgetData(
            SYSTEM_BATTERY_PERCENT_METRIC_KEY,
            "BATT",
            "%",
        ),
        ...buildMetricViewIcons({ hardware: "other", status: "percentage" }),
    };
}

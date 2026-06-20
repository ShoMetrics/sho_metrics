import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import { SYSTEM_BATTERY_PERCENT_METRIC_KEY } from "../../runtime/metric-keys";
import { buildBatteryMetricKeyFromIdentity } from "../../runtime/sources/battery/battery-metric-key";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedSystemMetricTarget,
    type ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import type { SingleMetricViewOptions } from "../../view-updates/runner";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";

export function buildSystemViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedSystemMetricTarget;
    readonly metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const metricKey = resolveSystemMetricKey(options.target);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey,
        widgetData: options.metrics.getWidgetData(
            metricKey,
            "BATT",
            "%",
            100,
        ),
        ...buildMetricViewIcons({ hardware: "other", status: "percentage" }),
    };
}

export function resolveSystemMetricKeys(target: ResolvedSystemMetricTarget): readonly string[] {
    return [resolveSystemMetricKey(target)];
}

function resolveSystemMetricKey(target: ResolvedSystemMetricTarget): string {
    if (target.reading.peripheralIdentity === undefined) {
        return SYSTEM_BATTERY_PERCENT_METRIC_KEY;
    }

    return buildBatteryMetricKeyFromIdentity(target.reading.peripheralIdentity);
}

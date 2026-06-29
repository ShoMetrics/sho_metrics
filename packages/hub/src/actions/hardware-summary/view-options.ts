import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import type { SourceClientStatus } from "../../runtime/sources/source-client";
import type { ResolvedHardwareSummaryWidget } from "../../settings/resolved-settings";
import type { HardwareSummaryViewOptions } from "../../view-updates/runner";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";
import type { MetricStatusIconKind } from "../../widgets/icons/metric-status-icons";
import { readPrimaryHardwareSummaryMetricKey } from "./read-plan";
import { buildHardwareSummaryWidgetData, type HardwareSummaryReadingKind } from "./widget-data";

/** Builds action-owned render options for the fixed three-reading hardware summary view. */
export function buildHardwareSummaryViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly widget: ResolvedHardwareSummaryWidget;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
}): HardwareSummaryViewOptions {
    return {
        event: options.event,
        metricKey: readPrimaryHardwareSummaryMetricKey(options.widget),
        metricRenderKind: "hardwareSummary",
        resolvedSettings: options.widget.appearance,
        widgetData: buildHardwareSummaryWidgetData({
            widget: options.widget,
            metrics: options.metrics,
            helperStatus: options.helperStatus,
        }),
        ...buildMetricViewIcons({
            hardware: options.widget.target.domain,
            status: resolvePrimaryReadingIconStatus(options.widget.target.orderedReadings[0].kind),
        }),
    };
}

function resolvePrimaryReadingIconStatus(
    readingKind: HardwareSummaryReadingKind,
): MetricStatusIconKind {
    switch (readingKind) {
        case "usage":
            return "percentage";
        case "temperature":
            return "temperature";
        case "power":
            return "power";
        case "vram":
            return "memory";
    }
}

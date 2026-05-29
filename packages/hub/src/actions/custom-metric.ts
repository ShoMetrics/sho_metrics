import { action, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setMetricView } from "../view-updates/runner";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import type { ResolvedCatalogMetricTarget } from "../settings/resolved-settings";
import type { WidgetData } from "../view-rendering/widget-data";

const CATALOG_NO_SELECTION_METRIC_KEY = "catalog.unselected";
const CATALOG_NO_SELECTION_LABEL = "METRIC";
const CATALOG_NO_SELECTION_PLACEHOLDER = "Choose metric";

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.catalog })
export class CustomMetric extends MetricAction {
    protected readonly actionKind = "catalog";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const catalogTarget = readResolvedMetricTarget(settings, "catalog");

        return resolveCatalogMetricSubscriptionKeys(catalogTarget);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const catalogTarget = readResolvedMetricTarget(settings, "catalog");

        if (catalogTarget.metricId.length === 0) {
            setMetricView({
                event,
                resolvedSettings: settings.widget.slot.appearance,
                metricKey: CATALOG_NO_SELECTION_METRIC_KEY,
                widgetData: buildNoSelectionWidgetData(),
                ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
            });
            return;
        }

        const metrics = this.getMetricReader(event);
        // TODO(step5): replace this generic read with helper-backed unit and scale handling.
        setMetricView({
            event,
            resolvedSettings: settings.widget.slot.appearance,
            metricKey: catalogTarget.metricId,
            widgetData: metrics.getWidgetData(
                catalogTarget.metricId,
                catalogTarget.fallbackLabel ?? CATALOG_NO_SELECTION_LABEL,
                catalogTarget.fallbackUnit ?? "",
            ),
            ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
        });
    }
}

function resolveCatalogMetricSubscriptionKeys(
    target: ResolvedCatalogMetricTarget,
): readonly string[] {
    return target.metricId.length === 0 ? [] : [target.metricId];
}

function buildNoSelectionWidgetData(): WidgetData {
    return {
        current: 0,
        progress: 0,
        history: [],
        label: CATALOG_NO_SELECTION_LABEL,
        unit: "",
        unavailableDisplayValue: CATALOG_NO_SELECTION_PLACEHOLDER,
    };
}

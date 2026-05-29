import { action, type PropertyInspectorDidAppearEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { setMetricView } from "../view-updates/runner";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import { logger } from "../logging/logger";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import type { MetricDescriptorSnapshot } from "../runtime/sources/source-client";
import type { ResolvedCatalogMetricTarget } from "../settings/resolved-settings";
import type { WidgetData } from "../view-rendering/widget-data";

const log = logger.for("Action:CustomMetric");
const CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS = 30_000;
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

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        this.refreshCatalogMetricDescriptorsForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh custom metric runtime cache: ${String(error)}`);
            });
    }

    protected async refreshCatalogMetricDescriptorsForPropertyInspector(
        event: PropertyInspectorDidAppearEvent,
    ): Promise<void> {
        await this.updateRuntimeCache(event, {
            catalogMetricDescriptorLoadState: "pending",
        });

        try {
            const descriptorSnapshot = await this.readCatalogMetricDescriptorSnapshot();

            await this.updateRuntimeCache(event, {
                availableCatalogMetricDescriptors: descriptorSnapshot.descriptors,
                catalogMetricDescriptorLoadState: "ready",
            });
        } catch (error) {
            log.atWarn()
                .everyMs(
                    "catalog-metric-descriptors-load-failed",
                    CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS,
                )
                .log(() => `Failed to load custom metric descriptors. error=${String(error)}`);

            await this.updateRuntimeCache(event, {
                availableCatalogMetricDescriptors: [],
                catalogMetricDescriptorLoadState: "failed",
            });
        }
    }

    protected readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        return backgroundMetricCollection.readSourceMetricDescriptors(WINDOWS_HELPER_SOURCE_ID);
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

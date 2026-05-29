import { action, type PropertyInspectorDidAppearEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { setMetricView } from "../view-updates/runner";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import { readHelperBackedWidgetData } from "./shared/helper-backed-widget-data";
import { logger } from "../logging/logger";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import type { MetricDescriptorSnapshot, SourceClientStatus } from "../runtime/sources/source-client";
import type { ResolvedCatalogMetricTarget, ResolvedWidgetSettings } from "../settings/resolved-settings";
import type { WidgetData } from "../view-rendering/widget-data";
import type { SingleMetricViewOptions } from "../view-updates/runner";

const log = logger.for("Action:CustomMetric");
const CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS = 30_000;
const CATALOG_NO_SELECTION_RENDER_KEY = "catalog.unselected";
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

        setMetricView(catalogTarget.metricId.length === 0
            ? buildCustomMetricNoSelectionViewOptions({ event, settings })
            : buildCustomMetricSelectedViewOptions({
                event,
                settings,
                target: catalogTarget,
                metrics: this.getMetricReader(event),
                helperStatus: this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID),
            }));
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

export function buildCustomMetricNoSelectionViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
}): SingleMetricViewOptions {
    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: CATALOG_NO_SELECTION_RENDER_KEY,
        widgetData: buildNoSelectionWidgetData(),
        ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
    };
}

export function buildCustomMetricSelectedViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCatalogMetricTarget;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
}): SingleMetricViewOptions {
    const unit = options.target.fallbackUnit ?? "";

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: options.target.metricId,
        widgetData: readHelperBackedWidgetData({
            metrics: options.metrics,
            metricKey: options.target.metricId,
            label: options.target.fallbackLabel ?? CATALOG_NO_SELECTION_LABEL,
            unit,
            maxValue: resolveCustomMetricMaximumValue(unit),
            helperStatus: options.helperStatus,
        }),
        ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
    };
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

// Rendering cannot depend on the PI descriptor cache, so v1 scales from the
// unit string stored with the selected catalog metric.
// TODO: If CatalogMetricTarget stores a unit enum later, replace this string
// mapping with the typed MetricUnit -> maximum table.
function resolveCustomMetricMaximumValue(unit: string): number {
    switch (unit) {
        case "W":
            return 300;
        case "RPM":
            return 3000;
        case "ms":
            return 1000;
        case "%":
        case "C":
        case "V":
        case "A":
        case "Hz":
        case "B":
        case "B/s":
        case "s":
        default:
            return 100;
    }
}

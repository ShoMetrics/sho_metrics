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
import { formatMetricUnit } from "../metrics/metric-unit-format";
import { resolveCatalogMetricDefaultMaximumValue } from "../metrics/catalog-metric-scale";
import { formatCatalogMetricFreshWidgetData } from "../metrics/catalog-metric-widget-data";

const log = logger.for("Action:CatalogMetric");
const CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS = 30_000;
const CATALOG_NO_SELECTION_RENDER_KEY = "catalog.unselected";
const CATALOG_NO_SELECTION_LABEL = "METRIC";
const CATALOG_NO_SELECTION_PLACEHOLDER = "Choose metric";

@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.catalog })
export class CatalogMetric extends MetricAction {
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
            ? buildCatalogMetricNoSelectionViewOptions({ event, settings })
            : buildCatalogMetricSelectedViewOptions({
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
                log.warn(() => `Failed to refresh catalog metric runtime cache: ${String(error)}`);
            });
    }

    protected async refreshCatalogMetricDescriptorsForPropertyInspector(
        event: PropertyInspectorDidAppearEvent,
    ): Promise<void> {
        const pendingSourceStatus = this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);
        await this.updateRuntimeCache(event, {
            catalogMetricDescriptorLoadState: "pending",
            ...(pendingSourceStatus ? { catalogMetricDescriptorSourceStatus: pendingSourceStatus } : {}),
        });

        try {
            const descriptorSnapshot = await this.readCatalogMetricDescriptorSnapshot();
            const sourceStatus = this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);

            await this.updateRuntimeCache(event, {
                availableCatalogMetricDescriptors: descriptorSnapshot.descriptors,
                catalogMetricDescriptorLoadState: "ready",
                ...(sourceStatus ? { catalogMetricDescriptorSourceStatus: sourceStatus } : {}),
            });
        } catch (error) {
            log.atWarn()
                .everyMs(
                    "catalog-metric-descriptors-load-failed",
                    CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS,
                )
                .log(() => `Failed to load catalog metric descriptors. error=${String(error)}`);
            const sourceStatus = this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);

            await this.updateRuntimeCache(event, {
                availableCatalogMetricDescriptors: [],
                catalogMetricDescriptorLoadState: "failed",
                ...(sourceStatus ? { catalogMetricDescriptorSourceStatus: sourceStatus } : {}),
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

export function buildCatalogMetricNoSelectionViewOptions(options: {
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

export function buildCatalogMetricSelectedViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCatalogMetricTarget;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
}): SingleMetricViewOptions {
    // Rendering must be self-contained after selection. The descriptor catalog
    // may be unavailable later, so use stored detected hints plus user overrides.
    const unit = formatMetricUnit(options.target.detectedUnit);
    const label = options.target.customLabel
        ?? options.target.detectedLabel
        ?? CATALOG_NO_SELECTION_LABEL;
    const maxValue = options.target.customMaximumValue
        ?? resolveCatalogMetricDefaultMaximumValue(
            options.target.detectedUnit,
            options.target.detectedCategory,
            options.target.detectedReadingKind,
        );

    return {
        event: options.event,
        resolvedSettings: options.settings.widget.slot.appearance,
        metricKey: options.target.metricId,
        widgetData: readHelperBackedWidgetData({
            metrics: options.metrics,
            metricKey: options.target.metricId,
            label,
            unit,
            maxValue,
            helperStatus: options.helperStatus,
            // Catalog-specific formatting runs only after the helper freshness
            // gate accepts the sample, so helper-error and no-data copy stays intact.
            transformFreshWidgetData: (widgetData) => formatCatalogMetricFreshWidgetData({
                widgetData,
                unit: options.target.detectedUnit,
                category: options.target.detectedCategory,
            }),
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

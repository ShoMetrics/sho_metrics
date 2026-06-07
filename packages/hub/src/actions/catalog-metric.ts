import { action, type PropertyInspectorDidAppearEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import type { MetricStoreReader } from "../runtime/metric-store";
import { setMetricView } from "../view-updates/runner";
import { buildMetricViewIcons } from "../widgets/icons/metric-view-icons";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    HELPER_INSTALL_NOTICE_TEXT,
    readHelperBackedWidgetData,
    resolveHelperRequiredInstallNoticeText,
} from "./shared/helper-backed-widget-data";
import { logger } from "../logging/logger";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import type { MetricDescriptorSnapshot, SourceClientStatus } from "../runtime/sources/source-client";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedCatalogMetricTarget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import type { WidgetData } from "../view-rendering/widget-data";
import type { SingleMetricViewOptions } from "../view-updates/runner";
import { formatMetricUnit } from "../metrics/metric-unit-format";
import { resolveCatalogMetricDefaultMaximumValue } from "../metrics/catalog-metric-scale";
import { formatCatalogMetricFreshWidgetData } from "../metrics/catalog-metric-widget-data";

const log = logger.for("Action:CatalogMetric");
const CATALOG_DESCRIPTOR_LOAD_WARNING_INTERVAL_MILLISECONDS = 30_000;
const CATALOG_NO_SELECTION_DEBUG_INTERVAL_MILLISECONDS = 5_000;
const CATALOG_NO_SELECTION_RENDER_KEY = "catalog.unselected";
const CATALOG_NO_SELECTION_LABEL = "METRIC";
export const CATALOG_INSTALL_HELPER_NOTICE_TEXT = HELPER_INSTALL_NOTICE_TEXT;
export const CATALOG_CHOOSE_METRIC_NOTICE_TEXT = "Choose metric";

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

        const helperStatus = this.readCachedSourceStatus(WINDOWS_HELPER_SOURCE_ID);
        const platform = this.currentPlatform();

        if (catalogTarget.metricId.length === 0) {
            logCatalogMetricNoSelectionRender(helperStatus, platform);
            setMetricView(buildCatalogMetricNoSelectionViewOptions({ event, settings, helperStatus, platform }));
            return;
        }

        setMetricView(buildCatalogMetricSelectedViewOptions({
            event,
            settings,
            target: catalogTarget,
            metrics: this.getMetricReader(event),
            helperStatus,
        }));
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        if (this.currentPlatform() !== "win32") {
            // Catalog metrics are currently backed only by the Windows helper.
            // Non-Windows profiles can still contain this action after sync or
            // import, so keep the PI responsive without probing a source that
            // cannot exist on this platform.
            void this.updateRuntimeCache(event, {
                availableCatalogMetricDescriptors: [],
                catalogMetricDescriptorLoadState: "failed",
            });
            return;
        }

        this.refreshCatalogMetricDescriptorsForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh catalog metric runtime cache: ${String(error)}`);
            });
    }

    protected async refreshCatalogMetricDescriptorsForPropertyInspector(
        event: PropertyInspectorDidAppearEvent,
    ): Promise<void> {
        const refreshNoSelectionKey = (): void => {
            if (readResolvedMetricTarget(this.resolveSettings(event), "catalog").metricId.length === 0) {
                this.refreshActiveMetricView(event);
            }
        };

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
            refreshNoSelectionKey();
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
            refreshNoSelectionKey();
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

/**
 * Builds the catalog metric onboarding key before a metric is selected.
 *
 * This is the only built-in surface that may show `Choose metric`; built-in
 * CPU/GPU widgets never use that notice because their metric is preselected.
 */
export function buildCatalogMetricNoSelectionViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly helperStatus: SourceClientStatus | undefined;
    readonly platform?: NodeJS.Platform;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const noticeText = resolveNoSelectionNoticeText(options.helperStatus, options.platform ?? process.platform);

    return {
        event: options.event,
        resolvedSettings: widget.slot.appearance,
        metricKey: CATALOG_NO_SELECTION_RENDER_KEY,
        widgetData: buildNoSelectionWidgetData(),
        ...(noticeText === undefined ? {} : { noticeText }),
        ...buildMetricViewIcons({ hardware: "unknown", status: "percentage" }),
    };
}

/**
 * Builds a selected catalog metric key from stored selection hints.
 *
 * The descriptor catalog can be unavailable after selection, so rendering must
 * not depend on live descriptors to preserve the user's existing key.
 */
export function buildCatalogMetricSelectedViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedCatalogMetricTarget;
    readonly metrics: MetricStoreReader;
    readonly helperStatus: SourceClientStatus | undefined;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
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

    const widgetData = readHelperBackedWidgetData({
        metrics: options.metrics,
        metricKey: options.target.metricId,
        label,
        unit,
        maxValue,
        helperStatus: options.helperStatus,
        // Catalog-specific formatting runs only after the helper freshness
        // gate accepts the sample, so helper-error and no-data copy stays intact.
        transformFreshWidgetData: (freshWidgetData) => formatCatalogMetricFreshWidgetData({
            widgetData: freshWidgetData,
            unit: options.target.detectedUnit,
            category: options.target.detectedCategory,
        }),
    });
    const noticeText = resolveHelperRequiredInstallNoticeText({
        helperStatus: options.helperStatus,
        widgetData,
    });

    return {
        event: options.event,
        resolvedSettings: widget.slot.appearance,
        metricKey: options.target.metricId,
        widgetData,
        ...(noticeText === undefined ? {} : { noticeText }),
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
    };
}

function resolveNoSelectionNoticeText(
    helperStatus: SourceClientStatus | undefined,
    platform: NodeJS.Platform,
): string | undefined {
    if (platform !== "win32") {
        return undefined;
    }

    if (helperStatus?.state === "unavailable" && helperStatus.reason === "helperNotInstalled") {
        return CATALOG_INSTALL_HELPER_NOTICE_TEXT;
    }

    if (helperStatus?.state === "available") {
        return CATALOG_CHOOSE_METRIC_NOTICE_TEXT;
    }

    return undefined;
}

function logCatalogMetricNoSelectionRender(
    helperStatus: SourceClientStatus | undefined,
    platform: NodeJS.Platform,
): void {
    log.atDebug()
        .everyMs("catalog-no-selection-helper-status", CATALOG_NO_SELECTION_DEBUG_INTERVAL_MILLISECONDS)
        .log(() => [
            "catalogNoSelectionRender",
            `helperStatus=${formatSourceStatusForDebug(helperStatus)}`,
            `keyCopy=${resolveNoSelectionNoticeText(helperStatus, platform) ?? "N/A"}`,
        ].join(" "));
}

function formatSourceStatusForDebug(sourceStatus: SourceClientStatus | undefined): string {
    if (sourceStatus === undefined) {
        return "undefined";
    }

    return [
        sourceStatus.state,
        sourceStatus.reason ?? "no-reason",
        sourceStatus.lastSuccessAtTimestampMilliseconds === undefined
            ? "never-success"
            : "has-success",
    ].join("/");
}

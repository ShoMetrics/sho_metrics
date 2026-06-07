import { action, type PropertyInspectorDidAppearEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { requireResolvedDenseMultiMetricWidget, type ResolvedMetricSourcePolicy } from "../settings/resolved-settings";
import { listMetricReadPlanKeys, type MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import { buildMetricReadPlanFromSourcePolicy } from "../runtime/source-routing/metric-read-plan-builder";
import { wallClockNowMilliseconds } from "../shared/clock";
import { setMetricView } from "../view-updates/runner";
import {
    buildDenseMetricReadPlan,
    buildDenseMetricWidgetData,
    type DenseMetricWidgetData,
} from "./dense-multi-metric/row-data";
import { getMetricStatusIcon } from "../widgets/icons/metric-status-icons";
import { refreshCatalogMetricDescriptorRuntimeCache } from "./shared/catalog-metric-descriptor-runtime-cache";
import { logger } from "../logging/logger";
import type { MetricDescriptorSnapshot } from "../runtime/sources/source-client";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import { diskVolumeRegistry } from "../runtime/disk-volumes";
import { resolveDiskUsageMetricSubscriptionKeys } from "./disk/metric-subscriptions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";

const log = logger.for("Action:DenseMultiMetric");
const autoMetricSourcePolicy: ResolvedMetricSourcePolicy = {
    primarySourceProfileId: undefined,
    fallbackSourceProfileIds: [],
    failureMode: "useFallback",
};

/** Dense Multi Metric action that collects several metric rows for one key. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric })
export class DenseMultiMetric extends MetricAction {
    protected readonly actionKind = "denseMultiMetric";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        return listMetricReadPlanKeys(this.buildDenseReadPlan(widget).readPlan);
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));

        return this.buildDenseReadPlan(widget).rows
            .find(row => row.rowKind === "configured")
            ?.displayMetricKey;
    }

    protected override buildMetricCollectionReadPlan(event: WillAppearEvent): MetricReadPlan {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        return this.buildDenseReadPlan(widget).readPlan;
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        // Dense rows reuse domain-owned PI pickers, but the action itself does
        // not own a single metric target. Warm the runtime caches those pickers
        // need instead of calling MetricAction's single-slot refresh path.
        refreshCatalogMetricDescriptorRuntimeCache({
            platform: this.currentPlatform(),
            readCachedSourceStatus: sourceId => this.readCachedSourceStatus(sourceId),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
            readMetricDescriptorSnapshot: () => this.readCatalogMetricDescriptorSnapshot(),
        })
            .catch(error => {
                log.warn(() => `Failed to refresh dense metric catalog runtime cache: ${String(error)}`);
            });
        this.refreshDiskVolumesForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh dense metric disk volume runtime cache: ${String(error)}`);
            });
    }

    protected refreshDiskVolumesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        log.debug(() => `diskVolumeRefreshStart actionId=${event.action.id}`);

        return this.refreshDiskVolumeRegistryForPropertyInspector()
            .then(() => this.publishDiskVolumeOptions(event));
    }

    protected refreshDiskVolumeRegistryForPropertyInspector(): Promise<void> {
        // Disk volume options are discovered as a side effect of reading disk
        // usage keys. Dense cannot use MetricAction.refreshMetricKeys here:
        // that helper intentionally assumes widget.slot exists.
        return backgroundMetricCollection.refreshReadPlanOnce(buildMetricReadPlanFromSourcePolicy({
            metricKeys: resolveDiskUsageMetricSubscriptionKeys(undefined),
            sourcePolicy: autoMetricSourcePolicy,
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
        })).then(() => undefined);
    }

    protected publishDiskVolumeOptions(event: PropertyInspectorDidAppearEvent): Promise<void> {
        const availableDiskVolumes = [...diskVolumeRegistry.getOptions()];
        log.debug(() => `diskVolumeOptionsPublish actionId=${event.action.id} volumeCount=${availableDiskVolumes.length} volumes=${formatDiskVolumeSummary(availableDiskVolumes)}`);

        return this.updateRuntimeCache(event, {
            availableDiskVolumes,
        });
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const widget = requireResolvedDenseMultiMetricWidget(settings);
        const denseWidgetData = this.buildDenseWidgetData(event);
        const firstMetricKey = denseWidgetData.rows
            .find(row => row.rowKind === "configured")
            ?.metricKey
            ?? "dense-multi-metric";

        setMetricView({
            event,
            metricRenderKind: "denseMetric",
            metricKey: firstMetricKey,
            resolvedSettings: widget.appearance,
            widgetData: denseWidgetData,
            // TODO(dense-render-contract): split dense render options from single/dual-only icon requirements.
            centerIconFragment: "",
            statusIcon: getMetricStatusIcon("percentage"),
        });
    }

    protected buildDenseWidgetData(event: WillAppearEvent): DenseMetricWidgetData {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));

        return buildDenseMetricWidgetData({
            widget,
            metrics: this.getMetricReader(event),
            platform: this.currentPlatform(),
            currentTimestampMilliseconds: wallClockNowMilliseconds(),
        });
    }

    private buildDenseReadPlan(widget: ReturnType<typeof requireResolvedDenseMultiMetricWidget>) {
        return buildDenseMetricReadPlan({
            widget,
            platform: this.currentPlatform(),
        });
    }

    protected readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        return backgroundMetricCollection.readSourceMetricDescriptors(WINDOWS_HELPER_SOURCE_ID);
    }
}

function formatDiskVolumeSummary(volumes: ReturnType<typeof diskVolumeRegistry.getOptions>): string {
    return JSON.stringify(volumes.map(volume => ({
        id: volume.id,
        mount: volume.mount,
        fs: volume.fs,
        sizeBytes: volume.sizeBytes,
        storageKind: volume.storageKind,
    })));
}

import {
    action,
    type PropertyInspectorDidAppearEvent,
    type SendToPluginEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import {
    requireResolvedDenseMultiMetricWidget,
    type ResolvedDenseMultiMetricWidget,
    type ResolvedWidgetSettings,
} from "../settings/resolved-settings";
import { listMetricReadPlanKeys, type MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
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
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { refreshDiskVolumeRuntimeCache } from "./shared/disk-volume-runtime-cache";
import { refreshNetworkInterfaceRuntimeCache } from "./shared/network-interface-runtime-cache";
import type { CustomHttpMetricDefinition } from "../runtime/sources/custom-http/custom-http-definition-registry";
import { buildDenseCustomHttpConsumerSlug } from "../runtime/sources/custom-http/custom-http-metric-key";
import {
    resolveCustomHttpMetricDefinition,
} from "./custom-metric/runtime-source-definition";
import {
    CustomHttpActionConnector,
    type CustomHttpActionConnectorDependencies,
} from "./custom-metric/custom-http-action-connector";

const log = logger.for("Action:DenseMultiMetric");

type DenseMultiMetricActionDependencies = CustomHttpActionConnectorDependencies;

/** Dense Multi Metric action that collects several metric rows for one key. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric })
export class DenseMultiMetric extends MetricAction {
    protected readonly actionKind = "denseMultiMetric";

    private readonly customHttpConnector: CustomHttpActionConnector;

    constructor(options: DenseMultiMetricActionDependencies = {}) {
        super();
        this.customHttpConnector = new CustomHttpActionConnector(options);
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        return listMetricReadPlanKeys(this.buildDenseReadPlan(widget, event.action.id).readPlan);
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));

        return this.buildDenseReadPlan(widget, event.action.id).rows
            .find(row => row.rowKind === "configured")
            ?.displayMetricKey;
    }

    protected override buildMetricCollectionReadPlan(event: WillAppearEvent): MetricReadPlan {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        return this.buildDenseReadPlan(widget, event.action.id).readPlan;
    }

    protected override onResolvedSettingsChanged(event: WillAppearEvent, settings: ResolvedWidgetSettings): void {
        const widget = requireResolvedDenseMultiMetricWidget(settings);
        this.customHttpConnector.syncActionDefinitions(
            event.action.id,
            resolveDenseCustomHttpMetricDefinitions(widget, event.action.id),
        );
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        this.customHttpConnector.clearAction(event.action.id);
    }

    override onSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): void {
        super.onSendToPlugin(event);
        this.customHttpConnector.handleSendToPlugin(event);
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
        this.refreshNetworkInterfacesForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh dense metric network interface runtime cache: ${String(error)}`);
            });
    }

    protected refreshDiskVolumesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        log.debug(() => `diskVolumeRefreshStart actionId=${event.action.id}`);

        return this.refreshDiskVolumeRuntimeCacheForPropertyInspector(event);
    }

    protected refreshDiskVolumeRuntimeCacheForPropertyInspector(
        event: PropertyInspectorDidAppearEvent,
    ): Promise<void> {
        return refreshDiskVolumeRuntimeCache({
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
        });
    }

    protected refreshNetworkInterfacesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return refreshNetworkInterfaceRuntimeCache({
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
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
            actionId: event.action.id,
            platform: this.currentPlatform(),
            currentTimestampMilliseconds: wallClockNowMilliseconds(),
        });
    }

    private buildDenseReadPlan(widget: ReturnType<typeof requireResolvedDenseMultiMetricWidget>, actionId: string) {
        return buildDenseMetricReadPlan({
            widget,
            actionId,
            platform: this.currentPlatform(),
        });
    }

    protected readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        return backgroundMetricCollection.readSourceMetricDescriptors(WINDOWS_HELPER_SOURCE_ID);
    }
}

function resolveDenseCustomHttpMetricDefinitions(
    widget: ResolvedDenseMultiMetricWidget,
    actionId: string,
): readonly CustomHttpMetricDefinition[] {
    return widget.slots
        .map(slot => {
            const target = slot.slot.metric.target;
            if (target.domain !== "customMetric") {
                return undefined;
            }

            return resolveCustomHttpMetricDefinition({
                target,
                actionId,
                consumerSlug: buildDenseCustomHttpConsumerSlug(slot.slotId),
            });
        })
        .filter((definition): definition is CustomHttpMetricDefinition => definition !== undefined);
}

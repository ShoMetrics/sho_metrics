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
    type ResolvedSystemPeripheralIdentity,
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
import type { BatteryDeviceDescriptor } from "../runtime/sources/battery/battery-device-descriptor";
import { areBatteryPeripheralIdentitiesEquivalentForSelection } from "../runtime/sources/battery/battery-peripheral-identity-comparison";
import { shouldEnableVendorHidBatterySupport } from "../runtime/source-capabilities/vendor-hid-battery-platform-capabilities";
import { readBatteryDeviceDescriptorSnapshotForPropertyInspector } from "../runtime/sources/battery/battery-device-descriptor-snapshot";
import {
    readBatteryCacheSuppressionIdentity,
    resolveBatteryDeviceCachePatchForPropertyInspector,
} from "../runtime/sources/battery/battery-device-cache-patch";
import { SelectedBatteryRouteRegistrar } from "../runtime/sources/battery/selected-battery-route-registrar";
import type { WidgetRuntimeCachePatch } from "../runtime/widget-runtime-cache";
import { resolveSystemMetricKeys } from "./system/view-builder";

const log = logger.for("Action:DenseMultiMetric");
const DENSE_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS = 30_000;

type DenseMultiMetricActionDependencies = CustomHttpActionConnectorDependencies;

/**
 * Runs Dense Multi Metric actions and owns row-level runtime cache refreshes.
 *
 * Dense rows can include Custom HTTP and System battery targets. Those targets
 * need action-owned lifecycle hooks for local metric keys, selected battery
 * routes, and PI runtime cache refreshes before rendering can treat them like
 * ordinary metric rows.
 */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric })
export class DenseMultiMetric extends MetricAction {
    protected readonly actionKind = "denseMultiMetric";

    private readonly customHttpConnector: CustomHttpActionConnector;
    private readonly selectedBatteryRouteRegistrar = new SelectedBatteryRouteRegistrar();

    constructor(options: DenseMultiMetricActionDependencies = {}) {
        super();
        this.customHttpConnector = new CustomHttpActionConnector(options);
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        return listMetricReadPlanKeys(this.buildDenseReadPlan(widget, event.action.id).readPlan);
    }

    protected override getSourceDiagnosticMetricKey(event: WillAppearEvent): string | undefined {
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
        this.selectedBatteryRouteRegistrar.sync(event.action.id, readSelectedSystemPeripheralRoutes(widget));
    }

    protected override onActionWillDisappear(event: WillDisappearEvent): void {
        this.customHttpConnector.clearAction(event.action.id);
        this.selectedBatteryRouteRegistrar.clear(event.action.id);
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
        this.refreshBatteryDevicesForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh dense metric battery device runtime cache: ${String(error)}`);
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

    protected override sendRuntimeCachePatchToPropertyInspector(
        event: WillAppearEvent | PropertyInspectorDidAppearEvent,
        patch: WidgetRuntimeCachePatch,
    ): Promise<void> {
        const widget = requireResolvedDenseMultiMetricWidget(this.resolveSettings(event));
        const cacheSuppressionIdentity = readBatteryCacheSuppressionIdentity(
            widget.slots.map(slot => slot.slot.metric.target),
        );

        return super.sendRuntimeCachePatchToPropertyInspector(
            event,
            resolveBatteryDeviceCachePatchForPropertyInspector(patch, cacheSuppressionIdentity),
        );
    }

    protected async refreshBatteryDevicesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        const isVendorHidBatterySupported = shouldEnableVendorHidBatterySupport(this.currentPlatform());
        const batteryDeviceSnapshot = await readBatteryDeviceDescriptorSnapshotForPropertyInspector({
            isExperimentalVendorHidEnabled: isVendorHidBatterySupported
                && this.resolveGlobalVendorHidBatteryEnabled(),
        });
        const availableBatteryDevices = batteryDeviceSnapshot.availableBatteryDevices;
        const selectedRoutes = readSelectedSystemPeripheralRoutes(
            requireResolvedDenseMultiMetricWidget(this.resolveSettings(event)),
        );
        logDenseBatteryDeviceCacheRefresh(event.action.id, availableBatteryDevices, selectedRoutes);

        await this.updateRuntimeCache(event, {
            availableBatteryDevices,
            batteryDeviceDiscoveryDiagnostics: batteryDeviceSnapshot.batteryDeviceDiscoveryDiagnostics,
        });
    }

    private resolveGlobalVendorHidBatteryEnabled(): boolean {
        return pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled;
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const widget = requireResolvedDenseMultiMetricWidget(settings);
        const denseWidgetData = this.buildDenseWidgetData(event);
        const firstMetricKey = denseWidgetData.rows
            .find(row => row.rowKind === "configured")
            ?.metricKey
            ?? "dense-multi-metric";

        setMetricView(this.withManualRefreshIndicator(event, {
            event,
            metricRenderKind: "denseMetric",
            metricKey: firstMetricKey,
            resolvedSettings: widget.appearance,
            widgetData: denseWidgetData,
            // TODO(dense-render-contract): split dense render options from single/dual-only icon requirements.
            centerIconFragment: "",
            statusIcon: getMetricStatusIcon("percentage"),
        }));
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

function readSelectedSystemPeripheralRoutes(widget: ResolvedDenseMultiMetricWidget): readonly {
    readonly metricKey: string;
    readonly identity: ResolvedSystemPeripheralIdentity;
}[] {
    const routes: {
        readonly metricKey: string;
        readonly identity: ResolvedSystemPeripheralIdentity;
    }[] = [];

    for (const slot of widget.slots) {
        const target = slot.slot.metric.target;
        if (target.domain !== "system" || target.reading.peripheralIdentity === undefined) {
            continue;
        }

        for (const metricKey of resolveSystemMetricKeys(target)) {
            routes.push({ metricKey, identity: target.reading.peripheralIdentity });
        }
    }

    return routes;
}

function logDenseBatteryDeviceCacheRefresh(
    actionId: string,
    availableBatteryDevices: readonly BatteryDeviceDescriptor[],
    selectedRoutes: readonly {
        readonly metricKey: string;
        readonly identity: ResolvedSystemPeripheralIdentity;
    }[],
): void {
    if (selectedRoutes.length === 0) {
        return;
    }

    const identityMatchCount = selectedRoutes.filter(route =>
        availableBatteryDevices.some(device =>
            device.identity !== undefined
            && areBatteryPeripheralIdentitiesEquivalentForSelection(device.identity, route.identity),
        )).length;
    const metricKeyMatchCount = selectedRoutes.filter(route =>
        availableBatteryDevices.some(device => device.metricKey === route.metricKey)).length;

    log.atDebug()
        .everyMs("dense-battery-device-cache-refresh", DENSE_BATTERY_DIAGNOSTIC_LOG_INTERVAL_MILLISECONDS)
        .log(() => [
            "denseBatteryDeviceCacheRefresh",
            `actionId=${actionId}`,
            `deviceCount=${availableBatteryDevices.length}`,
            `selectedRouteCount=${selectedRoutes.length}`,
            `identityMatchCount=${identityMatchCount}`,
            `metricKeyMatchCount=${metricKeyMatchCount}`,
            `selectedMetricKeys=${selectedRoutes.map(route => route.metricKey).join("|")}`,
            `descriptorMetricKeys=${availableBatteryDevices.map(device => device.metricKey).join("|")}`,
        ].join(" "));
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
